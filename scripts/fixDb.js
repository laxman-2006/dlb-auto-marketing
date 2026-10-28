const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'dlb_auto_marketing.db'));
db.prepare("UPDATE campaigns SET failed_count = 1 WHERE id = 'b5dfeea4-67b1-4c0b-80f5-3374c665c458'").run();
db.prepare("UPDATE whatsapp_senders SET connection_status = 'NOT_CONNECTED' WHERE is_default = 1").run();
console.log('Database cleaned successfully.');
