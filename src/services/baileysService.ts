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
      if (toPhone.includes('@g.us')) {
        const jid = toPhone.trim();
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
      }

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

  public static formatJid(phone: string): string {
    let clean = phone.replace(/[^\d]/g, '');
    if (clean.length === 10) clean = `91${clean}`;
    else if (clean.length === 11 && clean.startsWith('0')) clean = `91${clean.substring(1)}`;
    return `${clean}@s.whatsapp.net`;
  }

  /**
   * Create a new WhatsApp group
   */
  public static async createGroup(
    subject: string,
    initialPhones: string[] = []
  ): Promise<{ success: boolean; groupJid?: string; inviteLink?: string; error?: string }> {
    if (this.connectionStatus !== 'CONNECTED' || !this.socket) {
      return { success: false, error: 'WhatsApp is not connected. Please connect WhatsApp in Settings.' };
    }

    try {
      const jids: string[] = [];
      for (const phone of initialPhones) {
        const jid = this.formatJid(phone);
        if (jid.length > 15 && !jids.includes(jid)) {
          jids.push(jid);
        }
      }

      // WhatsApp limits group subject to 25-30 chars safely
      const cleanSubject = subject.slice(0, 25).trim() || 'DLB All Members';
      const group = await this.socket.groupCreate(cleanSubject, jids);

      let inviteLink = '';
      try {
        const code = await this.socket.groupInviteCode(group.id);
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch (e) {
        console.warn('[Baileys] Could not fetch group invite code:', e);
      }

      return {
        success: true,
        groupJid: group.id,
        inviteLink
      };
    } catch (err: any) {
      console.error('[Baileys] groupCreate error:', err);
      return { success: false, error: err.message || 'Failed to create WhatsApp group' };
    }
  }

  /**
   * Add members to an existing WhatsApp group in rate-limited batches
   */
  public static async addParticipantsToGroup(
    groupJid: string,
    phoneNumbers: string[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    total: number;
    added: number;
    invited: number;
    alreadyInGroup: number;
    failed: number;
    details: Array<{ phone: string; status: 'ADDED' | 'INVITED' | 'ALREADY_MEMBER' | 'FAILED'; error?: string }>;
    error?: string;
  }> {
    if (this.connectionStatus !== 'CONNECTED' || !this.socket) {
      return {
        success: false,
        total: phoneNumbers.length,
        added: 0,
        invited: 0,
        alreadyInGroup: 0,
        failed: phoneNumbers.length,
        details: [],
        error: 'WhatsApp is not connected.'
      };
    }

    const details: Array<{ phone: string; status: 'ADDED' | 'INVITED' | 'ALREADY_MEMBER' | 'FAILED'; error?: string }> = [];
    let addedCount = 0;
    let invitedCount = 0;
    let alreadyCount = 0;
    let failedCount = 0;

    // Filter and prepare valid JIDs
    const phoneMap = new Map<string, string>(); // jid -> raw phone
    for (const rawPhone of phoneNumbers) {
      const jid = this.formatJid(rawPhone);
      const clean = jid.split('@')[0];
      if (clean && clean.length >= 10) {
        phoneMap.set(jid, rawPhone);
      } else {
        details.push({ phone: rawPhone, status: 'FAILED', error: 'Invalid phone format' });
        failedCount++;
      }
    }

    const jidsToAdd = Array.from(phoneMap.keys());
    const chunkSize = 15; // Safe batch size to prevent WhatsApp rate throttling

    for (let i = 0; i < jidsToAdd.length; i += chunkSize) {
      const chunk = jidsToAdd.slice(i, i + chunkSize);
      try {
        const results = await this.socket.groupParticipantsUpdate(groupJid, chunk, 'add');
        for (const res of results) {
          const raw = phoneMap.get(res.jid) || res.jid.split('@')[0];
          const st = String(res.status);
          if (st === '200') {
            addedCount++;
            details.push({ phone: raw, status: 'ADDED' });
          } else if (st === '403') {
            invitedCount++;
            details.push({ phone: raw, status: 'INVITED', error: 'User privacy requires group invite link' });
          } else if (st === '408' || st === '409') {
            alreadyCount++;
            details.push({ phone: raw, status: 'ALREADY_MEMBER' });
          } else {
            failedCount++;
            details.push({ phone: raw, status: 'FAILED', error: `WhatsApp status code ${st}` });
          }
        }
      } catch (chunkErr: any) {
        console.error('[Baileys] Error adding batch:', chunkErr);
        for (const jid of chunk) {
          const raw = phoneMap.get(jid) || jid.split('@')[0];
          failedCount++;
          details.push({ phone: raw, status: 'FAILED', error: chunkErr.message || 'Batch update error' });
        }
      }

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, jidsToAdd.length), jidsToAdd.length);
      }

      // Small jitter pause between chunks to respect WhatsApp rate policies
      if (i + chunkSize < jidsToAdd.length) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    return {
      success: true,
      total: phoneNumbers.length,
      added: addedCount,
      invited: invitedCount,
      alreadyInGroup: alreadyCount,
      failed: failedCount,
      details
    };
  }

  /**
   * Get metadata and invite link for a group
   */
  public static async getGroupMetadata(groupJid: string): Promise<{
    subject: string;
    totalMembers: number;
    inviteLink?: string;
    participants: any[];
  } | null> {
    if (!this.socket || this.connectionStatus !== 'CONNECTED') return null;
    try {
      const meta = await this.socket.groupMetadata(groupJid);
      let inviteLink: string | undefined;
      try {
        const code = await this.socket.groupInviteCode(groupJid);
        if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch {}

      return {
        subject: meta.subject,
        totalMembers: meta.participants.length,
        inviteLink,
        participants: meta.participants
      };
    } catch (e) {
      console.error('[Baileys] getGroupMetadata error:', e);
      return null;
    }
  }

  /**
   * Update WhatsApp Group Subject / Name
   */
  public static async updateGroupSubject(groupJid: string, subject: string): Promise<boolean> {
    if (!this.socket || this.connectionStatus !== 'CONNECTED') return false;
    try {
      await this.socket.groupUpdateSubject(groupJid, subject.slice(0, 25).trim());
      return true;
    } catch (e) {
      console.error('[Baileys] updateGroupSubject error:', e);
      return false;
    }
  }
}
