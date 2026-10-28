import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  Browsers,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export class BaileysService {
  private static socket: WASocket | null = null;
  private static currentQrDataUrl: string | null = null;
  private static connectionStatus: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CONNECTION_ERROR' = 'NOT_CONNECTED';
  private static connectedPhoneNumber: string | null = null;
  private static connectedName: string | null = null;
  private static isInitializing = false;
  private static messageStore = new Map<string, proto.IMessage>();

  private static getAuthDir(): string {
    const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
    const authDir = path.join(dataDir, 'baileys_auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    return authDir;
  }

  public static async init(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      const authDir = this.getAuthDir();
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: 'silent' });

      this.connectionStatus = 'CONNECTING';

      this.socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.windows('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        getMessage: async (key: proto.IMessageKey) => {
          if (key.id && BaileysService.messageStore.has(key.id)) {
            return BaileysService.messageStore.get(key.id);
          }
          if (key.id) {
            try {
              const record = db.prepare('SELECT content FROM message_records WHERE wamid = ?').get(key.id) as any;
              if (record && record.content) {
                return { conversation: record.content };
              }
            } catch {}
          }
          return proto.Message.fromObject({});
        }
      });

      this.socket.ev.on('creds.update', saveCreds);

      // Cache all incoming and outgoing messages to answer retry/peer requests
      this.socket.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
          if (msg.key?.id && msg.message) {
            BaileysService.messageStore.set(msg.key.id, msg.message);
          }
        }
      });

      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            // Generate high quality QR code data URL (matching BizzMonitor Screenshot 2)
            this.currentQrDataUrl = await QRCode.toDataURL(qr, {
              width: 260,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#ffffff'
              }
            });
            this.connectionStatus = 'NOT_CONNECTED';
          } catch (qrErr) {
            console.error('[Baileys] Error rendering QR:', qrErr);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.connectionStatus = 'NOT_CONNECTED';
          this.currentQrDataUrl = null;

          if (shouldReconnect) {
            console.log('[Baileys] Connection closed, reconnecting...');
            this.isInitializing = false;
            setTimeout(() => this.init(), 3000);
          } else {
            console.log('[Baileys] Logged out. Clearing credentials...');
            this.clearAuth();
            this.isInitializing = false;
            setTimeout(() => this.init(), 1000);
          }
        } else if (connection === 'open') {
          this.connectionStatus = 'CONNECTED';
          this.currentQrDataUrl = null;

          // Extract connected user details
          const userJid = this.socket?.user?.id || '';
          const phoneNum = userJid.split(':')[0] || userJid.split('@')[0];
          this.connectedPhoneNumber = phoneNum ? `+${phoneNum}` : '+91 98765 00000';
          this.connectedName = this.socket?.user?.name || 'DLB AUTO MARKETING';

          console.log(`[Baileys] WhatsApp Connected successfully for ${this.connectedPhoneNumber}`);

          // Update SQLite default sender
          try {
            db.prepare(`
              UPDATE whatsapp_senders
              SET connection_status = 'CONNECTED',
                  display_phone_number = ?,
                  verified_name = ?,
                  connection_error_detail = NULL,
                  last_verified_at = CURRENT_TIMESTAMP
              WHERE is_default = 1
            `).run(this.connectedPhoneNumber, this.connectedName);
          } catch (dbErr) {
            console.error('[Baileys] Failed to update sender in DB:', dbErr);
          }
        }
      });
    } catch (err: any) {
      console.error('[Baileys] Init error:', err.message);
      this.connectionStatus = 'CONNECTION_ERROR';
    } finally {
      this.isInitializing = false;
    }
  }

  public static getStatus() {
    return {
      connected: this.connectionStatus === 'CONNECTED',
      state: this.connectionStatus,
      qrCodeDataUrl: this.currentQrDataUrl,
      displayPhoneNumber: this.connectedPhoneNumber || '+91 98765 00000',
      verifiedName: this.connectedName || 'DLB AUTO MARKETING'
    };
  }

  public static async disconnect(): Promise<void> {
    try {
      if (this.socket) {
        await this.socket.logout();
      }
    } catch (err) {
      console.error('[Baileys] Error logging out:', err);
    }
    this.clearAuth();
    this.connectionStatus = 'NOT_CONNECTED';
    this.connectedPhoneNumber = null;
    this.currentQrDataUrl = null;

    db.prepare(`
      UPDATE whatsapp_senders
      SET connection_status = 'DISCONNECTED',
          connection_error_detail = 'User disconnected WhatsApp'
      WHERE is_default = 1
    `).run();

    // Restart socket to generate new QR
    this.isInitializing = false;
    setTimeout(() => this.init(), 1000);
  }

  public static clearAuth() {
    try {
      const authDir = this.getAuthDir();
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[Baileys] Failed to clear auth dir:', err);
    }
  }

  public static clearClosedPeerSession(cleanNumber: string) {
    try {
      const authDir = this.getAuthDir();
      if (!fs.existsSync(authDir)) return;
      const files = fs.readdirSync(authDir);
      for (const f of files) {
        if (f.startsWith(`session-${cleanNumber}`)) {
          const filePath = path.join(authDir, f);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('"closed":') && !content.includes('"closed":-1')) {
              fs.unlinkSync(filePath);
              console.log(`[Baileys] Cleared stale closed session file for +${cleanNumber}: ${f}`);
            }
          } catch {}
        }
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Send WhatsApp message via connected session
   */
  public static async sendMessage(toPhone: string, text: string, mediaPath?: string): Promise<{ success: boolean; wamid?: string; error?: string }> {
    if (this.connectionStatus !== 'CONNECTED' || !this.socket) {
      return {
        success: false,
        error: 'WhatsApp is not connected. Please scan the QR code in Settings to connect your WhatsApp.'
      };
    }

    try {
      let cleanNumber = toPhone.replace(/[^\d]/g, '');
      if (cleanNumber.length === 10) {
        cleanNumber = `91${cleanNumber}`;
      } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
        cleanNumber = `91${cleanNumber.substring(1)}`;
      }

      if (!cleanNumber) {
        return { success: false, error: 'Invalid phone number.' };
      }

      // Automatically clear closed or desynced sessions so fresh prekeys are requested
      this.clearClosedPeerSession(cleanNumber);

      let jid = `${cleanNumber}@s.whatsapp.net`;
      try {
        const results = await this.socket.onWhatsApp(cleanNumber);
        if (results && results.length > 0) {
          if (results[0].exists === false) {
            return {
              success: false,
              error: `Phone number +${cleanNumber} is not registered on WhatsApp.`
            };
          }
          if (results[0].jid) {
            jid = results[0].jid;
          }
        }
      } catch (onWaErr) {
        // Fallback to direct jid
      }

      let result;
      if (mediaPath && fs.existsSync(mediaPath)) {
        const buffer = fs.readFileSync(mediaPath);
        result = await this.socket.sendMessage(jid, {
          image: buffer,
          caption: text
        });
      } else {
        result = await this.socket.sendMessage(jid, { text });
      }

      if (result?.key?.id && result?.message) {
        BaileysService.messageStore.set(result.key.id, result.message);
      }

      const wamid = result?.key?.id || `wamid.BAILEYS_${Date.now()}`;
      return { success: true, wamid };
    } catch (err: any) {
      console.error('[Baileys] Send error:', err);
      return { success: false, error: err.message || 'Failed to send WhatsApp message' };
    }
  }
}
