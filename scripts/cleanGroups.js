const Database = require('better-sqlite3');
const db = new Database('data/dlb_auto_marketing.db');

const phantomGroups = db.prepare("SELECT id, name FROM whatsapp_groups WHERE group_jid = 'PENDING_CREATION' OR group_jid IS NULL OR group_jid NOT LIKE '%@g.us'").all();
console.log('Found phantom groups:', phantomGroups);

for (const g of phantomGroups) {
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(g.id);
  db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(g.id);
  console.log(`Deleted phantom group ${g.name} (${g.id})`);
}

console.log('Remaining groups in DB:', db.prepare('SELECT id, name, group_jid, total_members FROM whatsapp_groups').all());
