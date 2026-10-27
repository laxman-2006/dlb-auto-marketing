import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { config } from '../config/env';

export interface MetaConnectionStatus {
  connected: boolean;
  state: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ACTION_REQUIRED' | 'DISCONNECTED' | 'AUTH_EXPIRED' | 'CONFIG_ERROR';
  businessName: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  messagingTier: string;
  codeVerificationStatus: string;
  errorDetail?: string;
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  text?: string;
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

export class MetaWhatsAppService {
  private static graphBaseUrl = 'https://graph.facebook.com';

  /**
   * Diagnostic verification of Meta WhatsApp Business Account & Sender credentials
   */
  public static async verifyConnection(
    wabaId: string,
    phoneNumberId: string,
    systemUserToken: string
  ): Promise<MetaConnectionStatus> {
    if (!systemUserToken || !phoneNumberId || !wabaId) {
      return {
        connected: false,
        state: 'NOT_CONNECTED',
        businessName: 'DLB AUTO MARKETING',
        wabaId: wabaId || '',
        phoneNumberId: phoneNumberId || '',
        displayPhoneNumber: '',
        qualityRating: 'UNKNOWN',
        messagingTier: 'TIER_1K',
        codeVerificationStatus: 'UNVERIFIED',
        errorDetail: 'Missing System User Token, WABA ID, or Phone Number ID.'
      };
    }

    // If live credentials are supplied, execute authentic Meta Graph API call
    try {
      const version = config.meta.graphApiVersion;
      // 1. Verify Phone Number
      const phoneRes = await axios.get(
        `${this.graphBaseUrl}/${version}/${phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${systemUserToken}` },
          params: {
            fields: 'verified_name,code_verification_status,display_phone_number,quality_rating,platform_type'
          },
          timeout: 10000
        }
      );

      // 2. Verify WABA
      const wabaRes = await axios.get(
        `${this.graphBaseUrl}/${version}/${wabaId}`,
        {
          headers: { Authorization: `Bearer ${systemUserToken}` },
          params: { fields: 'name,timezone_id,currency,status' },
          timeout: 10000
        }
      );

      const phoneData = phoneRes.data;
      const wabaData = wabaRes.data;

      return {
        connected: true,
        state: 'CONNECTED',
        businessName: wabaData.name || phoneData.verified_name || 'DLB AUTO MARKETING',
        wabaId,
        phoneNumberId,
        displayPhoneNumber: phoneData.display_phone_number || '',
        qualityRating: phoneData.quality_rating || 'GREEN',
        messagingTier: 'TIER_1K', // Default starting tier
        codeVerificationStatus: phoneData.code_verification_status || 'VERIFIED'
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message || 'Meta API connection failed';
      let state: MetaConnectionStatus['state'] = 'CONFIG_ERROR';

      if (err.response?.data?.error?.code === 190) {
        state = 'AUTH_EXPIRED';
      } else if (err.response?.data?.error?.error_subcode === 463) {
        state = 'AUTH_EXPIRED';
      }

      // If mockProvider is enabled and network/API fails, allow realistic sandbox verification for developer testing
      if (config.meta.mockProvider && (!systemUserToken || systemUserToken.startsWith('mock_') || systemUserToken.includes('test'))) {
        return {
          connected: true,
          state: 'CONNECTED',
          businessName: 'DLB AUTO MARKETING (Meta Sandbox)',
          wabaId,
          phoneNumberId,
          displayPhoneNumber: '+91 98765 00000',
          qualityRating: 'GREEN',
          messagingTier: 'TIER_1K (1,000 / 24h)',
          codeVerificationStatus: 'VERIFIED'
        };
      }

      return {
        connected: false,
        state,
        businessName: 'DLB AUTO MARKETING',
        wabaId,
        phoneNumberId,
        displayPhoneNumber: '',
        qualityRating: 'UNKNOWN',
        messagingTier: 'TIER_1K',
        codeVerificationStatus: 'UNVERIFIED',
        errorDetail: errorMsg
      };
    }
  }

  /**
   * Fetches official message templates from Meta Graph API
   */
  public static async fetchMetaTemplates(
    wabaId: string,
    systemUserToken: string
  ): Promise<any[]> {
    if (config.meta.mockProvider || !systemUserToken || systemUserToken.startsWith('mock_')) {
      // Return approved local database templates
      return db.prepare('SELECT * FROM message_templates').all();
    }

    try {
      const version = config.meta.graphApiVersion;
      const res = await axios.get(
        `${this.graphBaseUrl}/${version}/${wabaId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${systemUserToken}` },
          params: { limit: 100 },
          timeout: 10000
        }
      );
      return res.data.data || [];
    } catch (err: any) {
      console.warn('[Meta API] Failed to fetch live templates:', err.response?.data || err.message);
      return db.prepare('SELECT * FROM message_templates').all();
    }
  }

  /**
   * Sends an approved template message to a recipient via WhatsApp Cloud API
   */
  public static async sendTemplateMessage(params: {
    phoneNumberId: string;
    systemUserToken: string;
    to: string;
    templateName: string;
    languageCode: string;
    variables?: string[];
    headerImageUrl?: string;
  }): Promise<{ success: boolean; wamid?: string; error?: string }> {
    const { phoneNumberId, systemUserToken, to, templateName, languageCode, variables, headerImageUrl } = params;

    // Build standard Meta components payload
    const components: any[] = [];

    // Header image if supplied
    if (headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { link: headerImageUrl }
          }
        ]
      });
    }

    // Body variables
    if (variables && variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map((val) => ({
          type: 'text',
          text: String(val)
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'en_US' },
        ...(components.length > 0 ? { components } : {})
      }
    };

    // If live token is configured, post to official endpoint
    if (!config.meta.mockProvider && systemUserToken && !systemUserToken.startsWith('mock_')) {
      try {
        const version = config.meta.graphApiVersion;
        const res = await axios.post(
          `${this.graphBaseUrl}/${version}/${phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${systemUserToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        const wamid = res.data?.messages?.[0]?.id;
        return { success: true, wamid };
      } catch (err: any) {
        const errorData = err.response?.data?.error;
        const errorMsg = errorData ? `[${errorData.code}] ${errorData.message}` : err.message;
        return { success: false, error: errorMsg };
      }
    } else {
      // In simulation mode (for sandbox testing without incurring Meta fees or before setup)
      const mockWamid = `wamid.HBgMOTE${Date.now()}A${Math.floor(Math.random() * 1000000)}B`;
      return { success: true, wamid: mockWamid };
    }
  }

  /**
   * Sends a 2-way conversation freeform text message (Valid ONLY inside 24h Customer Service Window)
   */
  public static async sendSessionTextMessage(params: {
    phoneNumberId: string;
    systemUserToken: string;
    to: string;
    text: string;
  }): Promise<{ success: boolean; wamid?: string; error?: string }> {
    const { phoneNumberId, systemUserToken, to, text } = params;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text }
    };

    if (!config.meta.mockProvider && systemUserToken && !systemUserToken.startsWith('mock_')) {
      try {
        const version = config.meta.graphApiVersion;
        const res = await axios.post(
          `${this.graphBaseUrl}/${version}/${phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${systemUserToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        const wamid = res.data?.messages?.[0]?.id;
        return { success: true, wamid };
      } catch (err: any) {
        const errorData = err.response?.data?.error;
        const errorMsg = errorData ? `[${errorData.code}] ${errorData.message}` : err.message;
        return { success: false, error: errorMsg };
      }
    } else {
      const mockWamid = `wamid.HBgMOTE${Date.now()}CHAT${Math.floor(Math.random() * 1000000)}`;
      return { success: true, wamid: mockWamid };
    }
  }
}
