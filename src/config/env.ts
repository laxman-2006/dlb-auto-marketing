import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dlb_auto_jwt_secret_key_super_secure_2026',
  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    systemUserToken: process.env.META_SYSTEM_USER_TOKEN || '',
    wabaId: process.env.META_WABA_ID || '',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'dlb_webhook_token_secure_2026',
    graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v21.0',
    // When live credentials are not set or when in simulation mode, our Meta client acts as a realistic Meta WhatsApp Cloud API Provider
    mockProvider: process.env.META_MOCK_PROVIDER === 'true' || !process.env.META_SYSTEM_USER_TOKEN,
  },
  import: {
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '91',
    chunkSize: parseInt(process.env.IMPORT_CHUNK_SIZE || '500', 10),
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    rateLimitPerSecond: parseInt(process.env.QUEUE_RATE_LIMIT_PER_SEC || '20', 10),
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/social/youtube/callback',
  }
};
