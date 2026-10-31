import { google } from 'googleapis';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { db } from '../db/database';

interface OAuthStateData {
  state: string;
  createdAt: number;
}

// In-memory OAuth state storage with 15-minute expiration for CSRF protection
const activeOAuthStates = new Map<string, OAuthStateData>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of activeOAuthStates.entries()) {
    if (now - val.createdAt > 15 * 60 * 1000) {
      activeOAuthStates.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class YouTubeService {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private static readonly SALT = 'dlb_yt_token_salt_2026';

  /**
   * Derive a 32-byte encryption key from the application's JWT secret
   */
  private static getEncryptionKey(): Buffer {
    const secret = config.jwtSecret || 'dlb_auto_jwt_secret_key_super_secure_2026';
    return crypto.scryptSync(secret, this.SALT, 32);
  }

  /**
   * Encrypt a sensitive token string at rest using AES-256-GCM
   */
  public static encryptToken(plainText: string): string {
    if (!plainText) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.getEncryptionKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted token string at rest
   */
  public static decryptToken(cipherText: string): string {
    if (!cipherText) return '';
    try {
      const parts = cipherText.split(':');
      if (parts.length !== 3) {
        // Fallback in case token was saved in plain text previously
        return cipherText;
      }
      const [ivHex, authTagHex, encryptedHex] = parts;
      const decipher = crypto.createDecipheriv(
        this.ENCRYPTION_ALGORITHM,
        this.getEncryptionKey(),
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      console.error('[YouTubeService] Error decrypting token:', err.message);
      return '';
    }
  }

  /**
   * Get configured OAuth credentials from env or database
   */
  public static getOAuthCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
    let clientId = config.google.clientId;
    let clientSecret = config.google.clientSecret;
    const redirectUri = config.google.redirectUri;

    // Fallback to SQLite credentials if env variables were not set
    if (!clientId || !clientSecret) {
      const row = db.prepare('SELECT client_id, client_secret FROM social_accounts WHERE platform = ?').get('youtube') as any;
      if (row) {
        if (!clientId && row.client_id) clientId = row.client_id;
        if (!clientSecret && row.client_secret) clientSecret = row.client_secret;
      }
    }

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Create an unauthenticated Google OAuth2 client
   */
  public static createOAuth2Client(customRedirectUri?: string) {
    const creds = this.getOAuthCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env.');
    }
    return new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      customRedirectUri || creds.redirectUri
    );
  }

  /**
   * Generate an official Google OAuth authorization URL with CSRF state protection
   */
  public static generateAuthUrl(customRedirectUri?: string): { url: string; state: string } {
    const oauth2Client = this.createOAuth2Client(customRedirectUri);
    const state = crypto.randomBytes(32).toString('hex');
    activeOAuthStates.set(state, { state, createdAt: Date.now() });

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent prompt to guarantee receiving a refresh_token
      state
    });

    return { url, state };
  }

  /**
   * Validate state token to prevent CSRF attacks
   */
  public static validateOAuthState(state: string): boolean {
    if (!state) return false;
    const item = activeOAuthStates.get(state);
    if (!item) return false;
    if (Date.now() - item.createdAt > 15 * 60 * 1000) {
      activeOAuthStates.delete(state);
      return false;
    }
    activeOAuthStates.delete(state); // One-time use
    return true;
  }

  /**
   * Handle OAuth callback: exchange code for tokens, fetch channel details, and persist encrypted tokens
   */
  public static async handleOAuthCallback(code: string, state: string, customRedirectUri?: string): Promise<{ channelTitle: string; channelId: string }> {
    if (!this.validateOAuthState(state)) {
      throw new Error('Invalid or expired OAuth state token (CSRF check failed). Please initiate connection again.');
    }

    const oauth2Client = this.createOAuth2Client(customRedirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch authenticated YouTube channel info
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({
      part: ['snippet'],
      mine: true
    });

    const channels = channelRes.data.items || [];
    if (channels.length === 0) {
      throw new Error('No YouTube channel found associated with this Google account.');
    }

    const channel = channels[0];
    const channelId = channel.id || '';
    const channelTitle = channel.snippet?.title || 'Connected YouTube Channel';

    // Existing account record
    const existing = db.prepare('SELECT refresh_token FROM social_accounts WHERE platform = ?').get('youtube') as any;
    let finalRefreshToken = tokens.refresh_token;

    // Google only sends refresh_token on first consent or when prompt=consent is used.
    // If not returned, keep the existing encrypted refresh_token.
    let encryptedRefreshToken = '';
    if (finalRefreshToken) {
      encryptedRefreshToken = this.encryptToken(finalRefreshToken);
    } else if (existing?.refresh_token) {
      encryptedRefreshToken = existing.refresh_token;
    }

    const encryptedAccessToken = tokens.access_token ? this.encryptToken(tokens.access_token) : '';

    db.prepare(`
      INSERT INTO social_accounts (platform, account_name, account_id, access_token, refresh_token, status, updated_at)
      VALUES ('youtube', ?, ?, ?, ?, 'CONNECTED', CURRENT_TIMESTAMP)
      ON CONFLICT(platform) DO UPDATE SET
        account_name = excluded.account_name,
        account_id = excluded.account_id,
        access_token = excluded.access_token,
        refresh_token = COALESCE(NULLIF(excluded.refresh_token, ''), social_accounts.refresh_token),
        status = 'CONNECTED',
        updated_at = CURRENT_TIMESTAMP
    `).run(channelTitle, channelId, encryptedAccessToken, encryptedRefreshToken);

    console.log(`[YouTubeService] Successfully connected YouTube channel: "${channelTitle}" (${channelId})`);
    return { channelTitle, channelId };
  }

  /**
   * Get an authorized Google OAuth2 client with automatic token refreshing
   */
  public static async getAuthenticatedClient(): Promise<any> {
    const creds = this.getOAuthCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Google OAuth credentials not configured on server.');
    }

    const account = db.prepare('SELECT * FROM social_accounts WHERE platform = ?').get('youtube') as any;
    if (!account || account.status !== 'CONNECTED' || !account.refresh_token) {
      throw new Error('YouTube channel is not connected. Please connect YouTube in Settings.');
    }

    const rawRefreshToken = this.decryptToken(account.refresh_token);
    if (!rawRefreshToken) {
      throw new Error('Unable to decrypt YouTube refresh token. Please re-authenticate YouTube in Settings.');
    }

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: rawRefreshToken
    });

    // Auto-refresh token if needed
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const encrypted = this.encryptToken(tokens.refresh_token);
        db.prepare('UPDATE social_accounts SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE platform = ?').run(encrypted, 'youtube');
      }
      if (tokens.access_token) {
        const encrypted = this.encryptToken(tokens.access_token);
        db.prepare('UPDATE social_accounts SET access_token = ?, updated_at = CURRENT_TIMESTAMP WHERE platform = ?').run(encrypted, 'youtube');
      }
    });

    return oauth2Client;
  }

  /**
   * Real video publishing using YouTube Data API v3 videos.insert (Resumable Upload)
   */
  public static async uploadVideo(options: {
    filePath: string;
    title: string;
    description: string;
    tags?: string[];
    privacyStatus?: 'public' | 'private' | 'unlisted';
    categoryId?: string;
  }): Promise<{ videoId: string; videoUrl: string; title: string }> {
    if (!fs.existsSync(options.filePath)) {
      throw new Error(`Video file not found at path: ${options.filePath}`);
    }

    const authClient = await this.getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth: authClient });

    const title = options.title.trim() || `DLB Auto Video - ${new Date().toLocaleDateString()}`;
    // YouTube title limit is 100 characters
    const safeTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;

    const description = options.description.trim() || 'Uploaded via DLB AUTO MARKETING Automatic Dispatch.';
    const privacyStatus = options.privacyStatus || 'public';
    const categoryId = options.categoryId || '22'; // 22 = People & Blogs, 20 = Gaming

    const tags = options.tags && options.tags.length > 0
      ? options.tags
      : ['dlb', 'automarketing', 'shorts', 'viral', 'reels'];

    console.log(`[YouTubeService] Uploading video to YouTube: "${safeTitle}" (file: ${path.basename(options.filePath)})`);

    const fileSize = fs.statSync(options.filePath).size;
    const mediaStream = fs.createReadStream(options.filePath);

    try {
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        notifySubscribers: true,
        requestBody: {
          snippet: {
            title: safeTitle,
            description,
            tags,
            categoryId
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
            embeddable: true
          }
        },
        media: {
          body: mediaStream
        }
      });

      const videoId = response.data.id;
      if (!videoId) {
        throw new Error('YouTube did not return a valid video ID in API response.');
      }

      const videoUrl = `https://youtu.be/${videoId}`;
      console.log(`[YouTubeService] Video published successfully! ID: ${videoId} URL: ${videoUrl}`);

      return {
        videoId,
        videoUrl,
        title: safeTitle
      };
    } catch (err: any) {
      console.error('[YouTubeService] Upload error from YouTube API:', err.response?.data || err.message);
      // Check if error is due to revoked token
      const errStr = JSON.stringify(err.response?.data || err.message);
      if (errStr.includes('invalid_grant') || errStr.includes('Token has been expired or revoked')) {
        db.prepare("UPDATE social_accounts SET status = 'DISCONNECTED' WHERE platform = 'youtube'").run();
        throw new Error('YouTube token has been revoked or expired. Please re-connect YouTube in Settings.');
      }
      throw new Error(`YouTube API error: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Disconnect YouTube account and clear stored credentials
   */
  public static async disconnect(): Promise<void> {
    try {
      const account = db.prepare('SELECT refresh_token FROM social_accounts WHERE platform = ?').get('youtube') as any;
      if (account?.refresh_token) {
        const rawToken = this.decryptToken(account.refresh_token);
        if (rawToken) {
          const creds = this.getOAuthCredentials();
          if (creds.clientId && creds.clientSecret) {
            const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
            await oauth2Client.revokeToken(rawToken).catch(() => {});
          }
        }
      }
    } catch (err) {
      // Ignore token revocation network errors during disconnect
    }

    db.prepare(`
      UPDATE social_accounts
      SET status = 'DISCONNECTED', access_token = NULL, refresh_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE platform = 'youtube'
    `).run();

    console.log('[YouTubeService] YouTube account disconnected successfully.');
  }

  /**
   * Get current YouTube connection status with channel name and ID
   */
  public static getConnectionStatus(): { connected: boolean; channelName: string; channelId: string; hasClientId: boolean } {
    const creds = this.getOAuthCredentials();
    const hasClientId = Boolean(creds.clientId && creds.clientSecret);

    const account = db.prepare('SELECT * FROM social_accounts WHERE platform = ?').get('youtube') as any;
    const connected = Boolean(account && account.status === 'CONNECTED' && account.refresh_token);

    return {
      connected,
      channelName: account?.account_name || '',
      channelId: account?.account_id || '',
      hasClientId
    };
  }
}
