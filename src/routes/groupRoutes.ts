import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { BaileysService } from '../services/baileysService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper to normalize phone numbers
function cleanPhone(raw: string): string {
  let clean = raw.replace(/[^\d]/g, '');
  if (clean.length === 10) clean = `91${clean}`;
  else if (clean.length === 11 && clean.startsWith('0')) clean = `91${clean.substring(1)}`;
  return clean;
}

// GET /api/groups - List all groups
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    let groups = db.prepare('SELECT * FROM whatsapp_groups ORDER BY created_at DESC').all() as any[];

    // Refresh member counts and invite links for live groups
    for (const g of groups) {
      if (g.group_jid && g.group_jid.endsWith('@g.us') && BaileysService.getStatus().connected) {
        try {
          const meta = await BaileysService.getGroupMetadata(g.group_jid);
          if (meta) {
            g.total_members = meta.totalMembers;
            if (meta.inviteLink && !g.invite_link) {
              g.invite_link = meta.inviteLink;
              db.prepare('UPDATE whatsapp_groups SET invite_link = ?, total_members = ? WHERE id = ?')
                .run(meta.inviteLink, meta.totalMembers, g.id);
            }
          }
        } catch {}
      }
      // Count local recorded members
      const localCount = (db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(g.id) as any)?.c || 0;
      g.local_saved_members = localCount;
    }

    return res.json({ success: true, groups });
  } catch (err: any) {
    console.error('[GroupRoutes] Error fetching groups:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  }
});

// POST /api/groups/create - Create a new WhatsApp group
router.post('/create', async (req: Request, res: Response): Promise<any> => {
  const { name, initialPhones = [] } = req.body;
  const groupName = (name || 'DLB AUTO - All Members').slice(0, 25).trim();

  try {
    let groupJid = 'PENDING_CREATION';
    let inviteLink = '';

    if (BaileysService.getStatus().connected && initialPhones.length > 0) {
      const createRes = await BaileysService.createGroup(groupName, initialPhones);
      if (!createRes.success) {
        return res.status(400).json({ error: createRes.error || 'Failed to create WhatsApp group' });
      }
      groupJid = createRes.groupJid || groupJid;
      inviteLink = createRes.inviteLink || '';
    }

    const groupId = uuidv4();
    db.prepare(`
      INSERT INTO whatsapp_groups (id, name, group_jid, invite_link, total_members, description)
      VALUES (?, ?, ?, ?, ?, 'Official DLB AUTO Marketing Broadcast Group')
    `).run(groupId, groupName, groupJid, inviteLink, initialPhones.length);

    return res.json({
      success: true,
      group: {
        id: groupId,
        name: groupName,
        group_jid: groupJid,
        invite_link: inviteLink,
        total_members: initialPhones.length
      }
    });
  } catch (err: any) {
    console.error('[GroupRoutes] Create error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

// POST /api/groups/:id/add-members - Add numbers to group (from raw text or array)
router.post('/:id/add-members', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { rawNumbers, numbersList = [] } = req.body;

  const group = db.prepare('SELECT * FROM whatsapp_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Extract phone numbers from raw string or list
  const allPhones: string[] = [];
  if (Array.isArray(numbersList) && numbersList.length > 0) {
    numbersList.forEach((n: any) => {
      const c = cleanPhone(String(n || ''));
      if (c.length >= 10 && !allPhones.includes(c)) allPhones.push(c);
    });
  }

  if (rawNumbers && typeof rawNumbers === 'string') {
    // Split by commas, newlines, semicolons, tabs, spaces
    const tokens = rawNumbers.split(/[\r\n,;\t ]+/);
    tokens.forEach((t) => {
      const c = cleanPhone(t);
      if (c.length >= 10 && !allPhones.includes(c)) allPhones.push(c);
    });
  }

  if (allPhones.length === 0) {
    return res.status(400).json({ error: 'No valid phone numbers found.' });
  }

  // If group does not exist on WhatsApp yet, create it on-demand
  let groupJid = group.group_jid;
  if (!groupJid || groupJid === 'PENDING_CREATION' || groupJid.startsWith('OFFLINE_')) {
    if (BaileysService.getStatus().connected) {
      const initial = allPhones.slice(0, 1);
      const createRes = await BaileysService.createGroup(group.name, initial);
      if (createRes.success && createRes.groupJid) {
        groupJid = createRes.groupJid;
        db.prepare('UPDATE whatsapp_groups SET group_jid = ?, invite_link = ? WHERE id = ?')
          .run(groupJid, createRes.inviteLink || null, group.id);
        group.group_jid = groupJid;
        group.invite_link = createRes.inviteLink;
      }
    }
  }

  // Add participants via Baileys
  let addResult = {
    success: true,
    total: allPhones.length,
    added: 0,
    invited: 0,
    alreadyInGroup: 0,
    failed: 0,
    details: [] as Array<{ phone: string; status: 'ADDED' | 'INVITED' | 'ALREADY_MEMBER' | 'FAILED'; error?: string }>
  };

  if (BaileysService.getStatus().connected && groupJid && groupJid.endsWith('@g.us')) {
    addResult = await BaileysService.addParticipantsToGroup(groupJid, allPhones);
  } else {
    // If offline, save into database as PENDING / ADDED
    addResult.added = allPhones.length;
    addResult.details = allPhones.map((p) => ({ phone: p, status: 'ADDED' }));
  }

  // Save/Update records in SQLite group_members
  const insertMember = db.prepare(`
    INSERT INTO group_members (id, group_id, phone_number, status, error_detail, added_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(group_id, phone_number) DO UPDATE SET
      status = excluded.status,
      error_detail = excluded.error_detail,
      added_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction((details) => {
    for (const d of details) {
      insertMember.run(uuidv4(), group.id, d.phone, d.status, d.error || null);
    }
  });

  tx(addResult.details);

  // Update total members count
  const totalInDb = (db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ? AND status IN (\'ADDED\', \'ALREADY_MEMBER\')').get(group.id) as any)?.c || 0;
  db.prepare('UPDATE whatsapp_groups SET total_members = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(totalInDb, group.id);

  return res.json({
    success: true,
    total: allPhones.length,
    added: addResult.added,
    invited: addResult.invited,
    alreadyInGroup: addResult.alreadyInGroup,
    failed: addResult.failed,
    inviteLink: group.invite_link,
    details: addResult.details.slice(0, 50) // preview first 50
  });
});

// POST /api/groups/:id/upload - Upload Excel/CSV with thousands of numbers and add to group
router.post('/:id/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'No Excel or CSV file uploaded.' });
  }

  const group = db.prepare('SELECT * FROM whatsapp_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    const phoneSet = new Set<string>();

    for (const row of rawRows) {
      for (const val of Object.values(row)) {
        const strVal = String(val || '');
        const clean = cleanPhone(strVal);
        if (clean.length === 10 || clean.length === 12) {
          phoneSet.add(clean.length === 10 ? `91${clean}` : clean);
        }
      }
    }

    const allPhones = Array.from(phoneSet);
    if (allPhones.length === 0) {
      return res.status(400).json({ error: 'No phone numbers detected in the uploaded file.' });
    }

    // Create group on WhatsApp if needed
    let groupJid = group.group_jid;
    if (!groupJid || groupJid === 'PENDING_CREATION' || groupJid.startsWith('OFFLINE_')) {
      if (BaileysService.getStatus().connected) {
        const createRes = await BaileysService.createGroup(group.name, allPhones.slice(0, 1));
        if (createRes.success && createRes.groupJid) {
          groupJid = createRes.groupJid;
          db.prepare('UPDATE whatsapp_groups SET group_jid = ?, invite_link = ? WHERE id = ?')
            .run(groupJid, createRes.inviteLink || null, group.id);
          group.group_jid = groupJid;
          group.invite_link = createRes.inviteLink;
        }
      }
    }

    let addResult = {
      success: true,
      total: allPhones.length,
      added: 0,
      invited: 0,
      alreadyInGroup: 0,
      failed: 0,
      details: [] as Array<{ phone: string; status: 'ADDED' | 'INVITED' | 'ALREADY_MEMBER' | 'FAILED'; error?: string }>
    };

    if (BaileysService.getStatus().connected && groupJid && groupJid.endsWith('@g.us')) {
      addResult = await BaileysService.addParticipantsToGroup(groupJid, allPhones);
    } else {
      addResult.added = allPhones.length;
      addResult.details = allPhones.map((p) => ({ phone: p, status: 'ADDED' }));
    }

    // Save into database
    const insertMember = db.prepare(`
      INSERT INTO group_members (id, group_id, phone_number, status, error_detail, added_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(group_id, phone_number) DO UPDATE SET
        status = excluded.status,
        error_detail = excluded.error_detail,
        added_at = CURRENT_TIMESTAMP
    `);

    const tx = db.transaction((details) => {
      for (const d of details) {
        insertMember.run(uuidv4(), group.id, d.phone, d.status, d.error || null);
      }
    });

    tx(addResult.details);

    const totalInDb = (db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ? AND status IN (\'ADDED\', \'ALREADY_MEMBER\')').get(group.id) as any)?.c || 0;
    db.prepare('UPDATE whatsapp_groups SET total_members = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(totalInDb, group.id);

    return res.json({
      success: true,
      fileName: req.file.originalname,
      totalDetected: allPhones.length,
      added: addResult.added,
      invited: addResult.invited,
      alreadyInGroup: addResult.alreadyInGroup,
      failed: addResult.failed,
      inviteLink: group.invite_link,
      details: addResult.details.slice(0, 50)
    });
  } catch (err: any) {
    console.error('[GroupRoutes] Upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process Excel file' });
  }
});

// POST /api/groups/:id/send-message - Broadcast a message to the group
router.post('/:id/send-message', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { messageText, mediaUrl, mediaName } = req.body;

  if (!messageText || !messageText.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  const group = db.prepare('SELECT * FROM whatsapp_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  let mediaPath: string | undefined;
  if (mediaUrl) {
    const localUploadsDir = path.resolve(__dirname, '../../data/uploads');
    const localFile = path.join(localUploadsDir, path.basename(mediaUrl));
    if (fs.existsSync(localFile)) {
      mediaPath = localFile;
    }
  }

  let sendRes = { success: true, wamid: `wamid.GRP_${Date.now()}` };
  if (BaileysService.getStatus().connected && group.group_jid && group.group_jid.endsWith('@g.us')) {
    const res = await BaileysService.sendMessage(group.group_jid, messageText.trim(), mediaPath);
    if (!res.success) {
      return res.status(400).json({ error: res.error || 'Failed to send message to group' });
    }
    sendRes.wamid = res.wamid || sendRes.wamid;
  }

  const msgId = uuidv4();
  db.prepare(`
    INSERT INTO group_messages (id, group_id, group_jid, message_text, media_name, media_url, status, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SENT', CURRENT_TIMESTAMP)
  `).run(msgId, group.id, group.group_jid, messageText.trim(), mediaName || null, mediaUrl || null);

  return res.json({
    success: true,
    wamid: sendRes.wamid,
    message: {
      id: msgId,
      message_text: messageText.trim(),
      media_name: mediaName,
      media_url: mediaUrl,
      sent_at: new Date().toISOString()
    }
  });
});

// GET /api/groups/:id/members - Get list of members with search & pagination
router.get('/:id/members', (req: Request, res: Response): any => {
  const { id } = req.params;
  const search = ((req.query.q as string) || '').trim();
  const filter = ((req.query.status as string) || 'ALL').toUpperCase();
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const offset = (page - 1) * limit;

  let where = 'group_id = ?';
  const params: any[] = [id];

  if (filter !== 'ALL') {
    where += ' AND status = ?';
    params.push(filter);
  }

  if (search) {
    where += ' AND phone_number LIKE ?';
    params.push(`%${search}%`);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM group_members WHERE ${where}`).get(...params) as any).count;
  const members = db.prepare(`
    SELECT * FROM group_members
    WHERE ${where}
    ORDER BY added_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM group_members
    WHERE group_id = ? GROUP BY status
  `).all(id);

  return res.json({
    members,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts
  });
});

// GET /api/groups/:id/messages - Get messages sent to the group
router.get('/:id/messages', (req: Request, res: Response): any => {
  const { id } = req.params;
  const messages = db.prepare(`
    SELECT * FROM group_messages
    WHERE group_id = ?
    ORDER BY sent_at DESC
    LIMIT 100
  `).all(id);

  return res.json({ messages });
});

// PATCH /api/groups/:id/rename - Rename group
router.patch('/:id/rename', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name cannot be empty.' });
  }

  const cleanName = name.slice(0, 25).trim();
  const group = db.prepare('SELECT * FROM whatsapp_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Group not found.' });
  }

  db.prepare('UPDATE whatsapp_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(cleanName, id);

  // If live on WhatsApp, also update WhatsApp group subject
  if (group.group_jid && group.group_jid.endsWith('@g.us') && BaileysService.getStatus().connected) {
    try {
      await BaileysService.updateGroupSubject(group.group_jid, cleanName);
    } catch (e) {
      console.warn('[GroupRoutes] WhatsApp rename error:', e);
    }
  }

  return res.json({ success: true, name: cleanName });
});

// DELETE /api/groups/:id - Delete group and its local member ledger
router.delete('/:id', (req: Request, res: Response): any => {
  const { id } = req.params;

  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM group_messages WHERE group_id = ?').run(id);
  const deleted = db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(id);

  if (deleted.changes === 0) {
    return res.status(404).json({ error: 'Group not found.' });
  }

  return res.json({ success: true, message: 'Group deleted successfully.' });
});

export default router;
