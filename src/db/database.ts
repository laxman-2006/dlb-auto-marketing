import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const DB_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'dlb_auto_marketing.db');

export const db: Database.Database = new Database(DB_PATH, {
  // verbose: console.log
});

// Enable WAL mode for high performance concurrent reading and writing
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Seed default admin user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('Admin@123', salt);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'admin@dlbauto.com', passwordHash, 'DLB Admin', 'admin');
  }

  // Seed default Business Account if none exists
  const bAccountCount = db.prepare('SELECT COUNT(*) as count FROM business_accounts').get() as { count: number };
  let defaultBAccountId = '';
  if (bAccountCount.count === 0) {
    defaultBAccountId = uuidv4();
    db.prepare(`
      INSERT INTO business_accounts (
        id, meta_waba_id, business_name, timezone, currency, account_status, messaging_tier, quality_rating, webhook_verify_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      defaultBAccountId,
      'WABA_DLB_AUTO_10928374',
      'DLB AUTO MARKETING',
      'Asia/Kolkata',
      'INR',
      'ACTIVE',
      'TIER_1K',
      'GREEN',
      'dlb_webhook_token_secure_2026'
    );
  } else {
    const existing = db.prepare('SELECT id FROM business_accounts LIMIT 1').get() as { id: string };
    defaultBAccountId = existing.id;
  }

  // Seed WhatsApp Sender if none exists
  const senderCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_senders').get() as { count: number };
  if (senderCount.count === 0 && defaultBAccountId) {
    db.prepare(`
      INSERT INTO whatsapp_senders (
        id, business_account_id, phone_number_id, display_phone_number, verified_name, quality_rating, code_verification_status, is_default, connection_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      defaultBAccountId,
      'PHONE_ID_919876500000',
      '+91 98765 00000',
      'DLB AUTO MARKETING',
      'GREEN',
      'VERIFIED',
      1,
      'CONNECTED'
    );
  }

  // Seed Official Message Templates (compliant with WhatsApp Marketing Policy)
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM message_templates').get() as { count: number };
  if (templateCount.count === 0) {
    const defaultTemplates = [
      {
        id: uuidv4(),
        meta_template_id: 'meta_tpl_dlb_exclusive_deal',
        name: 'dlb_exclusive_deals',
        language: 'en_US',
        category: 'MARKETING',
        status: 'APPROVED',
        body_text: 'Hello {{1}},\n\nWe are pleased to share our exclusive new automotive arrivals and festive deals with you at DLB AUTO MARKETING!\n\nIf you would like to view our full inventory catalogue or get customized pricing, please reply to this message or tap the button below.',
        header_type: 'TEXT',
        header_content: 'DLB AUTO - Exclusive Inventory Update',
        footer_text: 'Reply STOP to unsubscribe from future updates',
        buttons_json: JSON.stringify([
          { type: 'QUICK_REPLY', text: 'View Catalogue' },
          { type: 'QUICK_REPLY', text: 'Talk to Advisor' }
        ]),
        variables_json: JSON.stringify(['Customer Name'])
      },
      {
        id: uuidv4(),
        meta_template_id: 'meta_tpl_dlb_service_reminder',
        name: 'dlb_service_reminder',
        language: 'en_US',
        category: 'MARKETING',
        status: 'APPROVED',
        body_text: 'Hello {{1}},\n\nIs your vehicle due for scheduled maintenance? Ensure top performance with DLB AUTO SERVICE. Enjoy a complimentary 40-point inspection when you book your service this week.\n\nReply YES to confirm your preferred date.',
        header_type: 'NONE',
        header_content: null,
        footer_text: 'DLB AUTO Service Center | Reply STOP to opt out',
        buttons_json: JSON.stringify([
          { type: 'QUICK_REPLY', text: 'Book Service Now' }
        ]),
        variables_json: JSON.stringify(['Customer Name'])
      },
      {
        id: uuidv4(),
        meta_template_id: 'meta_tpl_dlb_general_announcement',
        name: 'dlb_general_announcement',
        language: 'en_US',
        category: 'MARKETING',
        status: 'PENDING',
        body_text: 'Dear {{1}},\n\nExciting news from DLB AUTO! We have expanded our pre-owned certified vehicles showroom. Visit us this weekend for exclusive launch offers.',
        header_type: 'NONE',
        header_content: null,
        footer_text: 'Reply STOP to opt out',
        buttons_json: '[]',
        variables_json: JSON.stringify(['Customer Name'])
      }
    ];

    const insertTpl = db.prepare(`
      INSERT INTO message_templates (
        id, meta_template_id, name, language, category, status, body_text, header_type, header_content, footer_text, buttons_json, variables_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const tpl of defaultTemplates) {
      insertTpl.run(
        tpl.id,
        tpl.meta_template_id,
        tpl.name,
        tpl.language,
        tpl.category,
        tpl.status,
        tpl.body_text,
        tpl.header_type,
        tpl.header_content,
        tpl.footer_text,
        tpl.buttons_json,
        tpl.variables_json
      );
    }
  }

  // Safe migrations for custom_message, media_name, media_url
  try { db.exec("ALTER TABLE campaigns ADD COLUMN custom_message TEXT;"); } catch {}
  try { db.exec("ALTER TABLE campaigns ADD COLUMN media_name TEXT;"); } catch {}
  try { db.exec("ALTER TABLE campaigns ADD COLUMN media_url TEXT;"); } catch {}

  // Safe migrations for WhatsApp Groups feature
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_jid TEXT UNIQUE NOT NULL,
        invite_link TEXT,
        total_members INTEGER DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        contact_name TEXT,
        status TEXT DEFAULT 'ADDED',
        error_detail TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, phone_number)
      );

      CREATE TABLE IF NOT EXISTS group_messages (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        group_jid TEXT NOT NULL,
        message_text TEXT NOT NULL,
        media_name TEXT,
        media_url TEXT,
        status TEXT DEFAULT 'SENT',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (grpErr) {
    console.error('[Database] Failed to init group tables:', grpErr);
  }

  // Seed reference campaigns if none exist
  const campCount = db.prepare('SELECT COUNT(*) as count FROM campaigns').get() as { count: number };
  if (campCount.count === 0) {
    const tpl = db.prepare('SELECT id FROM message_templates LIMIT 1').get() as { id: string };
    const sender = db.prepare('SELECT id FROM whatsapp_senders LIMIT 1').get() as { id: string };

    const camp1Id = uuidv4();
    db.prepare(`
      INSERT INTO campaigns (
        id, name, sender_id, template_id, contact_segment, total_recipients, sent_count, delivered_count, read_count, failed_count, status, custom_message, media_name, created_at
      ) VALUES (?, 'Personal Message - 01', ?, ?, 'ELIGIBLE', 1, 1, 1, 1, 0, 'COMPLETED', 'Hello kya kar raha hai', '1906999269975_01.webp', '2026-10-25 17:31:00')
    `).run(camp1Id, sender.id, tpl.id);

    // Recipient for camp1
    db.prepare(`
      INSERT INTO campaign_recipients (
        id, campaign_id, phone_number, customer_name, status, message_id, idempotency_key, sent_at, delivered_at, read_at
      ) VALUES (?, ?, '919876543210', 'Rahul Sharma', 'READ', 'wamid.HBgSAMPLE01', ?, '2026-10-25 17:31:05', '2026-10-25 17:31:12', '2026-10-25 17:31:40')
    `).run(uuidv4(), camp1Id, `IDEMP_${camp1Id}_1`);

    const camp2Id = uuidv4();
    const camp2Text = 'https://youtu.be/YT_C-f01lFo?si=b2E6yT-nFja4TlQS\n\nHello Sir 🙏 Kaise ho aap? 😊 Mera YouTube channel hai, please ek baar subscribe kar dena. Aapka support mere liye bahut maayne rakhta hai ❤️🙏\nSir, aapko bhi apne brand ka promotion karwana ho toh please humse contact karein. 😊';
    db.prepare(`
      INSERT INTO campaigns (
        id, name, sender_id, template_id, contact_segment, total_recipients, sent_count, delivered_count, read_count, failed_count, status, custom_message, created_at
      ) VALUES (?, 'YouTube Promotion Blast', ?, ?, 'ALL', 12214, 49, 45, 30, 10, 'PAUSED', ?, '2026-10-25 19:03:00')
    `).run(camp2Id, sender.id, tpl.id, camp2Text);

    // Seed some recipients for camp2
    const insertRecip = db.prepare(`
      INSERT INTO campaign_recipients (id, campaign_id, phone_number, customer_name, status, message_id, idempotency_key, sent_at, delivered_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 49; i++) {
      const phone = `9198000000${i.toString().padStart(2, '0')}`;
      insertRecip.run(
        uuidv4(),
        camp2Id,
        phone,
        `Client ${i + 1}`,
        i < 40 ? 'DELIVERED' : 'SENT',
        `wamid.HBgSAMPLE02_${i}`,
        `IDEMP_${camp2Id}_${i}`,
        '2026-10-25 19:03:15',
        '2026-10-25 19:03:25',
        null
      );
    }
    for (let i = 49; i < 60; i++) {
      const phone = `9198000000${i.toString().padStart(2, '0')}`;
      insertRecip.run(
        uuidv4(),
        camp2Id,
        phone,
        `Client ${i + 1}`,
        'FAILED',
        null,
        `IDEMP_${camp2Id}_${i}`,
        null,
        null,
        'Recipient unavailable / Rate limit'
      );
    }
  }

  console.log(`[Database] SQLite initialized at ${DB_PATH} in WAL mode.`);
}
