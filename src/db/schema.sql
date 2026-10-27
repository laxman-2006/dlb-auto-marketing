-- DLB AUTO MARKETING SQLite Database Schema
-- WAL (Write-Ahead Logging) mode, indexed for high-volume 25k+ record queries

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_accounts (
  id TEXT PRIMARY KEY,
  meta_waba_id TEXT UNIQUE,
  business_name TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  currency TEXT DEFAULT 'INR',
  account_status TEXT DEFAULT 'PENDING', -- PENDING, ACTIVE, RESTRICTED, BLOCKED
  messaging_tier TEXT DEFAULT 'TIER_1K', -- TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED
  quality_rating TEXT DEFAULT 'GREEN',   -- GREEN, YELLOW, RED, UNKNOWN
  system_user_token TEXT,
  app_id TEXT,
  app_secret TEXT,
  webhook_verify_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_senders (
  id TEXT PRIMARY KEY,
  business_account_id TEXT NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
  phone_number_id TEXT UNIQUE NOT NULL,
  display_phone_number TEXT NOT NULL,
  verified_name TEXT NOT NULL,
  quality_rating TEXT DEFAULT 'GREEN', -- GREEN, YELLOW, RED, UNKNOWN
  code_verification_status TEXT DEFAULT 'VERIFIED',
  platform_type TEXT DEFAULT 'CLOUD_API',
  is_default INTEGER DEFAULT 1,
  connection_status TEXT DEFAULT 'NOT_CONNECTED', -- NOT_CONNECTED, CONNECTING, CONNECTED, ACTION_REQUIRED, DISCONNECTED, AUTH_EXPIRED, CONFIG_ERROR
  connection_error_detail TEXT,
  last_verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_contacts INTEGER DEFAULT 0,
  eligible_contacts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
  name TEXT,
  raw_phone TEXT NOT NULL,
  normalized_phone TEXT UNIQUE NOT NULL,
  country_code TEXT DEFAULT '91',
  consent_status TEXT NOT NULL DEFAULT 'CONSENT_REQUIRED', -- OPTED_IN, CONSENT_REQUIRED, OPTED_OUT
  consent_source TEXT,
  consent_timestamp DATETIME,
  contact_status TEXT NOT NULL DEFAULT 'VALID', -- VALID, INVALID, DUPLICATE
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  import_batch_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_consent_dnc ON contacts(consent_status, do_not_contact);
CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(import_batch_id);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL, -- OPTED_IN, OPTED_OUT
  source TEXT NOT NULL, -- EXCEL_IMPORT, INBOUND_WHATSAPP, MANUAL_OVERRIDE, WEB_FORM
  notes TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  invalid_rows INTEGER DEFAULT 0,
  no_consent_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
  error_summary TEXT,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS import_errors (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data TEXT,
  reason TEXT NOT NULL,
  error_type TEXT NOT NULL, -- MALFORMED_NUMBER, DUPLICATE_IN_FILE, DUPLICATE_IN_DB, MISSING_CONSENT, EMPTY_ROW
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_errors_job ON import_errors(import_job_id);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  meta_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en_US',
  category TEXT NOT NULL DEFAULT 'MARKETING', -- MARKETING, UTILITY, AUTHENTICATION
  status TEXT NOT NULL DEFAULT 'APPROVED',     -- APPROVED, PENDING, REJECTED, PAUSED
  body_text TEXT NOT NULL,
  header_type TEXT DEFAULT 'NONE',           -- NONE, TEXT, IMAGE, VIDEO, DOCUMENT
  header_content TEXT,
  footer_text TEXT,
  buttons_json TEXT,                         -- JSON array of buttons (QUICK_REPLY, URL, PHONE)
  variables_json TEXT,                       -- JSON array of variable mappings (e.g. ["Customer Name"])
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sender_id TEXT REFERENCES whatsapp_senders(id),
  template_id TEXT NOT NULL REFERENCES message_templates(id),
  contact_segment TEXT NOT NULL DEFAULT 'ELIGIBLE', -- ALL, ELIGIBLE, CONSENT_REQUIRED
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'DRAFT', -- DRAFT, SCHEDULED, QUEUED, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED
  scheduled_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  paused_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  customer_name TEXT,
  template_parameters_json TEXT,
  status TEXT DEFAULT 'QUEUED', -- QUEUED, SUBMITTED, ACCEPTED, SENT, DELIVERED, READ, FAILED, CANCELLED
  message_id TEXT,
  error_message TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_camp_recip_camp_status ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_camp_recip_idempotency ON campaign_recipients(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_camp_recip_msg_id ON campaign_recipients(message_id);

CREATE TABLE IF NOT EXISTS message_records (
  id TEXT PRIMARY KEY,
  wamid TEXT UNIQUE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  sender_id TEXT REFERENCES whatsapp_senders(id),
  recipient_phone TEXT NOT NULL,
  direction TEXT NOT NULL, -- OUTBOUND, INBOUND
  message_type TEXT NOT NULL, -- TEMPLATE, TEXT, IMAGE, DOCUMENT
  content TEXT,
  template_name TEXT,
  status TEXT NOT NULL, -- QUEUED, SUBMITTED, ACCEPTED, SENT, DELIVERED, READ, FAILED
  pricing_category TEXT, -- marketing, utility, service
  error_code TEXT,
  error_message TEXT,
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_msg_records_wamid ON message_records(wamid);
CREATE INDEX IF NOT EXISTS idx_msg_records_recipient ON message_records(recipient_phone);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature TEXT,
  processed_status TEXT DEFAULT 'PROCESSED', -- PROCESSED, FAILED, IGNORED
  error_log TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opt_out_records (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  trigger_word TEXT NOT NULL,
  raw_message TEXT,
  source TEXT NOT NULL DEFAULT 'INBOUND_WHATSAPP',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  sender_id TEXT REFERENCES whatsapp_senders(id),
  phone_number TEXT UNIQUE NOT NULL,
  contact_name TEXT,
  last_message_text TEXT,
  last_message_direction TEXT,
  last_message_timestamp DATETIME,
  unread_count INTEGER DEFAULT 0,
  customer_service_window_expires_at DATETIME,
  is_opted_out INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE,
  direction TEXT NOT NULL, -- INBOUND, OUTBOUND
  sender_phone TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  message_type TEXT DEFAULT 'TEXT', -- TEXT, TEMPLATE, IMAGE, DOCUMENT
  text_content TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'SENT', -- SENT, DELIVERED, READ, FAILED
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at);
