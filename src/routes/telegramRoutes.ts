import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { TelegramService } from '../services/telegramService';
import { normalizePhoneNumber } from '../services/phoneNormalizer';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.resolve('./data/uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `tg_${Date.now()}_${file.originalname}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// GET /api/telegram/status - Live Telegram connection status & QR
router.get('/status', (req: Request, res: Response) => {
  const status = TelegramService.getStatus();
  if (!status.connected && !status.qrCodeDataUrl) {
    TelegramService.init();
  }
  res.json({
    success: true,
    ...status
  });
});

// GET /api/telegram/feed - Personal campaign feed with metrics
router.get('/feed', (req: Request, res: Response) => {
  const feed = TelegramService.getCampaignFeed();
  res.json({ success: true, feed });
});

// GET /api/telegram/dialogs - Telegram contacts and chats for Search drawer
router.get('/dialogs', async (req: Request, res: Response): Promise<any> => {
  const query = (req.query.q as string) || '';
  const contacts = await TelegramService.getDialogs(query);
  res.json({ success: true, contacts });
});

// POST /api/telegram/connect-bot - Connect with Bot Token
router.post('/connect-bot', async (req: Request, res: Response): Promise<any> => {
  const { botToken } = req.body;
  if (!botToken) {
    return res.status(400).json({ error: 'Telegram Bot Token is required.' });
  }

  const success = await TelegramService.connectWithBotToken(botToken);
  if (success) {
    return res.json({
      success: true,
      message: 'Telegram Bot connected successfully!',
      status: TelegramService.getStatus()
    });
  } else {
    return res.status(400).json({
      error: 'Invalid Bot Token. Please check your token from @BotFather.'
    });
  }
});

// POST /api/telegram/send-phone-code - Send login code to phone
router.post('/send-phone-code', async (req: Request, res: Response): Promise<any> => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

  const result = await TelegramService.sendPhoneCode(phone);
  if (result.success) {
    return res.json({ success: true, message: 'Verification code sent to your Telegram app!' });
  } else {
    return res.status(400).json({ error: result.error });
  }
});

// POST /api/telegram/verify-phone-code - Sign in with OTP code
router.post('/verify-phone-code', async (req: Request, res: Response): Promise<any> => {
  const { code, password } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code is required.' });

  const result = await TelegramService.signInWithPhoneCode(code, password);
  if (result.success) {
    return res.json({ success: true, message: 'Telegram logged in successfully!', status: TelegramService.getStatus() });
  } else {
    return res.status(400).json({ error: result.error });
  }
});

// POST /api/telegram/disconnect - Disconnect session
router.post('/disconnect', async (req: Request, res: Response) => {
  await TelegramService.disconnect();
  res.json({ success: true, message: 'Telegram session disconnected.' });
});

// POST /api/telegram/send-personal - Send personal message
router.post('/send-personal', upload.single('media'), async (req: Request, res: Response): Promise<any> => {
  const { recipient, messageText } = req.body;
  if (!recipient || !messageText) {
    return res.status(400).json({ error: 'Recipient and message text are required.' });
  }

  const mediaPath = req.file?.path;
  const result = await TelegramService.sendMessage(recipient, messageText, mediaPath);

  if (result.success) {
    return res.json({ success: true, messageId: result.messageId });
  } else {
    return res.status(400).json({ error: result.error });
  }
});

// POST /api/telegram/send-bulk - Send personal messages in bulk (to individual recipients)
router.post('/send-bulk', upload.single('media'), async (req: Request, res: Response): Promise<any> => {
  let recipients: string[] = [];
  try {
    recipients = typeof req.body.recipients === 'string' ? JSON.parse(req.body.recipients) : req.body.recipients;
  } catch {
    recipients = (req.body.recipients || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
  }

  const messageText = req.body.messageText || '';
  if (!recipients || recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients provided.' });
  }
  if (!messageText) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  TelegramService.ensureTables();
  const campaignId = uuidv4();
  const totalCount = ((db.prepare('SELECT COUNT(*) as c FROM telegram_campaigns').get() as any)?.c || 0) + 1;
  const campTitle = `Telegram Blast #${totalCount} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const mediaPath = req.file?.path;
  const mediaName = req.file?.originalname;

  db.prepare(`
    INSERT INTO telegram_campaigns (id, name, message_text, media_name, total_recipients, delivered_count, pending_count, failed_count, status, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, 0, 'RUNNING', CURRENT_TIMESTAMP)
  `).run(campaignId, campTitle, messageText, mediaName || null, recipients.length, recipients.length);

  // If recipient count is > 20, run in background to prevent HTTP connection timeout
  const runSendLoop = async () => {
    let sentCount = 0;
    let failedCount = 0;

    for (const r of recipients) {
      // Check if cancelled
      const current = db.prepare('SELECT status FROM telegram_campaigns WHERE id = ?').get(campaignId) as any;
      if (current && (current.status === 'CANCELLED' || current.status === 'PAUSED')) {
        console.log(`[Telegram Broadcast ${campaignId}] Stopped by user. Status=${current.status}`);
        break;
      }

      const resSend = await TelegramService.sendMessage(r, messageText, mediaPath, campaignId);
      if (resSend.success) {
        sentCount++;
      } else {
        failedCount++;
      }

      db.prepare(`
        UPDATE telegram_campaigns
        SET delivered_count = ?, failed_count = ?, pending_count = ?
        WHERE id = ?
      `).run(sentCount, failedCount, Math.max(0, recipients.length - (sentCount + failedCount)), campaignId);

      // Safe anti-flood pause (600ms between personal messages)
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    db.prepare(`
      UPDATE telegram_campaigns
      SET status = 'COMPLETED', pending_count = 0
      WHERE id = ?
    `).run(campaignId);
  };

  if (recipients.length > 20) {
    // Launch async background worker
    runSendLoop().catch((err) => {
      console.error(`[Telegram Broadcast ${campaignId} Error]:`, err);
      db.prepare('UPDATE telegram_campaigns SET status = "FAILED" WHERE id = ?').run(campaignId);
    });

    return res.json({
      success: true,
      campaignId,
      total: recipients.length,
      message: `Started background broadcast to ${recipients.length} recipients!`
    });
  } else {
    // Small batches run synchronously
    await runSendLoop();
    const updated = db.prepare('SELECT * FROM telegram_campaigns WHERE id = ?').get(campaignId) as any;
    return res.json({
      success: true,
      campaignId,
      total: recipients.length,
      sentCount: updated?.delivered_count || 0,
      failedCount: updated?.failed_count || 0
    });
  }
});

// POST /api/telegram/campaigns/upload-broadcast - Upload Excel file to broadcast personal messages to all contacts
router.post('/campaigns/upload-broadcast', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'media', maxCount: 1 }]), async (req: Request, res: Response): Promise<any> => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const excelFile = files?.file?.[0];
  const mediaFile = files?.media?.[0];
  const messageText = (req.body.messageText || '').trim();

  if (!excelFile) {
    return res.status(400).json({ error: 'Please upload an Excel or CSV file.' });
  }
  if (!messageText) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  try {
    const workbook = XLSX.readFile(excelFile.path);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

    const seen = new Set<string>();
    const recipients: string[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell) continue;
        const raw = String(cell).trim();
        if (raw.startsWith('@') && raw.length >= 4) {
          if (!seen.has(raw)) {
            seen.add(raw);
            recipients.push(raw);
          }
          continue;
        }
        const norm = normalizePhoneNumber(raw, '91');
        if (norm.isValid && (norm.isMobile || norm.countryCode !== '91')) {
          if (!seen.has(norm.formatted)) {
            seen.add(norm.formatted);
            recipients.push(norm.formatted);
          }
        }
      }
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers found in the uploaded file.' });
    }

    TelegramService.ensureTables();
    const campaignId = uuidv4();
    const totalCount = ((db.prepare('SELECT COUNT(*) as c FROM telegram_campaigns').get() as any)?.c || 0) + 1;
    const campTitle = `Excel Blast #${totalCount} (${recipients.length} recipients) — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    db.prepare(`
      INSERT INTO telegram_campaigns (id, name, message_text, media_name, total_recipients, delivered_count, pending_count, failed_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, 0, 'RUNNING', CURRENT_TIMESTAMP)
    `).run(campaignId, campTitle, messageText, mediaFile?.originalname || null, recipients.length, recipients.length);

    // Launch background delivery
    (async () => {
      let sentCount = 0;
      let failedCount = 0;

      for (const r of recipients) {
        const current = db.prepare('SELECT status FROM telegram_campaigns WHERE id = ?').get(campaignId) as any;
        if (current && (current.status === 'CANCELLED' || current.status === 'PAUSED')) {
          console.log(`[Telegram Broadcast ${campaignId}] Stopped by user. Status=${current.status}`);
          break;
        }

        const resSend = await TelegramService.sendMessage(r, messageText, mediaFile?.path, campaignId);
        if (resSend.success) sentCount++;
        else failedCount++;

        db.prepare(`
          UPDATE telegram_campaigns
          SET delivered_count = ?, failed_count = ?, pending_count = ?
          WHERE id = ?
        `).run(sentCount, failedCount, Math.max(0, recipients.length - (sentCount + failedCount)), campaignId);

        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      db.prepare(`
        UPDATE telegram_campaigns
        SET status = 'COMPLETED', pending_count = 0
        WHERE id = ?
      `).run(campaignId);
    })().catch((err) => {
      console.error(`[Telegram Broadcast ${campaignId} Error]:`, err);
      db.prepare('UPDATE telegram_campaigns SET status = "FAILED" WHERE id = ?').run(campaignId);
    });

    return res.json({
      success: true,
      campaignId,
      totalRecipients: recipients.length,
      fileName: excelFile.originalname,
      message: `Started personal message broadcast to ${recipients.length} recipients!`
    });
  } catch (err: any) {
    console.error('[Telegram Excel Broadcast Error]:', err);
    return res.status(500).json({ error: err?.message || 'Failed to process Excel file' });
  }
});

// GET /api/telegram/groups - List Telegram groups
router.get('/groups', (req: Request, res: Response) => {
  TelegramService.ensureTables();
  const groups = db.prepare('SELECT * FROM telegram_groups ORDER BY created_at DESC').all() as any[];
  for (const g of groups) {
    const localCount = (db.prepare('SELECT COUNT(*) as c FROM telegram_group_members WHERE group_id = ?').get(g.id) as any)?.c || 0;
    g.local_saved_members = localCount;
  }
  res.json({ success: true, groups });
});

// POST /api/telegram/groups/create - Create Telegram group
router.post('/groups/create', async (req: Request, res: Response): Promise<any> => {
  const { name, initialPhones = [] } = req.body;
  const title = (name || 'DLB Telegram Group').trim();

  const resCreate = await TelegramService.createGroup(title, initialPhones);
  if (resCreate.success) {
    return res.json({
      success: true,
      group: {
        id: resCreate.groupId,
        name: title,
        invite_link: resCreate.inviteLink,
        total_members: initialPhones.length
      }
    });
  } else {
    return res.status(400).json({ error: resCreate.error });
  }
});

// POST /api/telegram/groups/:id/rename - Rename Telegram group
router.post('/groups/:id/rename', (req: Request, res: Response): any => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  db.prepare('UPDATE telegram_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(name.trim(), id);
  return res.json({ success: true, message: 'Group renamed successfully' });
});

// DELETE /api/telegram/groups/:id - Delete Telegram group
router.delete('/groups/:id', (req: Request, res: Response): any => {
  const { id } = req.params;
  db.prepare('DELETE FROM telegram_groups WHERE id = ?').run(id);
  db.prepare('DELETE FROM telegram_group_members WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM telegram_group_jobs WHERE group_id = ?').run(id);
  return res.json({ success: true, message: 'Group deleted successfully' });
});

// POST /api/telegram/groups/:id/upload - Upload Excel for up to 25,000 numbers in Telegram group
router.post('/groups/:id/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an Excel or CSV file.' });
  }

  const group = db.prepare('SELECT * FROM telegram_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Telegram group not found.' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

    const seen = new Set<string>();
    const allPhones: string[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell) continue;
        const raw = String(cell).trim();
        if (raw.startsWith('@') && raw.length >= 4) {
          if (!seen.has(raw)) {
            seen.add(raw);
            allPhones.push(raw);
          }
          continue;
        }

        const norm = normalizePhoneNumber(raw, '91');
        // Accept valid mobile numbers (or valid international numbers)
        if (norm.isValid && (norm.isMobile || norm.countryCode !== '91')) {
          if (!seen.has(norm.formatted)) {
            seen.add(norm.formatted);
            allPhones.push(norm.formatted);
          }
        }
      }
    }

    if (allPhones.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers or @usernames found in Excel file.' });
    }

    // Launch Background Addition Job
    const jobId = TelegramService.startBackgroundAddJob(group.id, group.group_jid, allPhones);

    return res.json({
      success: true,
      jobId,
      fileName: req.file.originalname,
      totalDetected: allPhones.length,
      message: `Started background addition of ${allPhones.length} members to ${group.name}!`
    });
  } catch (err: any) {
    console.error('[Telegram Excel Upload Error]:', err);
    return res.status(500).json({ error: err?.message || 'Failed to parse Excel file.' });
  }
});

// POST /api/telegram/groups/:id/add-members - Add numbers from paste
router.post('/groups/:id/add-members', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { members = [], rawNumbers = '' } = req.body;

  const group = db.prepare('SELECT * FROM telegram_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Telegram group not found.' });
  }

  let allNumbers: string[] = [];
  const rawList: string[] = Array.isArray(members) ? [...members] : [];
  if (rawNumbers && typeof rawNumbers === 'string') {
    rawList.push(...rawNumbers.split(/[\n,;]/));
  }

  for (const line of rawList) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('@') && trimmed.length >= 4) {
      allNumbers.push(trimmed);
      continue;
    }
    const norm = normalizePhoneNumber(trimmed, '91');
    if (norm.isValid && (norm.isMobile || norm.countryCode !== '91')) {
      allNumbers.push(norm.formatted);
    }
  }

  const unique = Array.from(new Set(allNumbers));
  if (unique.length === 0) {
    return res.status(400).json({ error: 'No valid phone numbers or @usernames provided.' });
  }

  const result = await TelegramService.addMembersToGroup(group.id, group.group_jid, unique);
  return res.json({
    total: unique.length,
    ...result
  });
});

// GET /api/telegram/groups/:id/jobs/active - Real-time progress for 25k batch additions
router.get('/groups/:id/jobs/active', (req: Request, res: Response): any => {
  const { id } = req.params;
  TelegramService.ensureTables();
  const job = db.prepare(`
    SELECT * FROM telegram_group_jobs
    WHERE group_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(id) as any;

  if (!job) {
    return res.json({ success: true, active: false });
  }

  const progressPct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 100;
  return res.json({
    success: true,
    active: job.status === 'RUNNING',
    job: {
      ...job,
      progressPct
    }
  });
});

// POST /api/telegram/groups/:id/jobs/cancel - Cancel running additions job
router.post('/groups/:id/jobs/cancel', (req: Request, res: Response): any => {
  const { id } = req.params;
  TelegramService.ensureTables();
  db.prepare(`UPDATE telegram_group_jobs SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND status = 'RUNNING'`).run(id);
  return res.json({ success: true, message: 'Job stopped successfully.' });
});

// POST /api/telegram/groups/:id/jobs/clear - Clear job card
router.post('/groups/:id/jobs/clear', (req: Request, res: Response): any => {
  const { id } = req.params;
  TelegramService.ensureTables();
  db.prepare(`DELETE FROM telegram_group_jobs WHERE group_id = ?`).run(id);
  return res.json({ success: true, message: 'Job record cleared.' });
});

// GET /api/telegram/groups/:id/members - Member ledger table
router.get('/groups/:id/members', (req: Request, res: Response) => {
  const { id } = req.params;
  const status = (req.query.status as string) || 'ALL';
  const search = ((req.query.search as string) || '').trim().toLowerCase();
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  TelegramService.ensureTables();

  let query = 'SELECT * FROM telegram_group_members WHERE group_id = ?';
  const params: any[] = [id];

  if (status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    query += ' AND (member_identifier LIKE ? OR contact_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as c');
  const total = (db.prepare(countQuery).get(...params) as any)?.c || 0;

  query += ' ORDER BY added_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const members = db.prepare(query).all(...params);

  res.json({
    success: true,
    members,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// POST /api/telegram/groups/:id/broadcast - Broadcast message to Telegram group
router.post('/groups/:id/broadcast', upload.single('media'), async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { messageText } = req.body;

  const group = db.prepare('SELECT * FROM telegram_groups WHERE id = ?').get(id) as any;
  if (!group) {
    return res.status(404).json({ error: 'Telegram group not found.' });
  }

  const rawJid = String(group.group_jid).replace(/^-100/, '').replace(/^-/, '');
  const targetPeer = `-100${rawJid}`;
  const mediaPath = req.file?.path;

  const resSend = await TelegramService.sendMessage(targetPeer, messageText, mediaPath);

  if (resSend.success) {
    return res.json({ success: true, message: 'Broadcast sent to Telegram group!' });
  } else {
    return res.status(400).json({ error: resSend.error });
  }
});

// DELETE /api/telegram/campaigns/:id - Delete a Telegram campaign/blast box
router.delete('/campaigns/:id', (req: Request, res: Response): any => {
  const { id } = req.params;
  TelegramService.ensureTables();

  try {
    if (id === 'legacy_initial_blast') {
      db.prepare("DELETE FROM telegram_messages WHERE campaign_id IS NULL OR campaign_id = 'legacy_initial_blast'").run();
    } else {
      db.prepare('DELETE FROM telegram_campaigns WHERE id = ?').run(id);
      db.prepare('DELETE FROM telegram_messages WHERE campaign_id = ?').run(id);
    }
    return res.json({ success: true, message: 'Telegram campaign deleted successfully.' });
  } catch (err: any) {
    console.error('[Telegram] Delete campaign error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete campaign.' });
  }
});

// GET /api/telegram/messages - Message records
router.get('/messages', (req: Request, res: Response) => {
  TelegramService.ensureTables();
  const records = db.prepare('SELECT * FROM telegram_messages ORDER BY sent_at DESC LIMIT 50').all();
  res.json({ success: true, records });
});

export default router;

