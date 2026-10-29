import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { QueueService } from '../services/queueService';
import { BaileysService } from '../services/baileysService';
import { normalizePhoneNumber } from '../services/phoneNormalizer';

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.resolve('./data/uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `wa_${Date.now()}_${file.originalname}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = Router();

// GET /api/campaigns - List campaigns
router.get('/', (req: Request, res: Response) => {
  const campaigns = db.prepare(`
    SELECT c.*, t.name as template_name, s.display_phone_number as sender_phone
    FROM campaigns c
    LEFT JOIN message_templates t ON c.template_id = t.id
    LEFT JOIN whatsapp_senders s ON c.sender_id = s.id
    ORDER BY c.created_at DESC
  `).all();
  res.json({ campaigns });
});

// GET /api/campaigns/feed - WhatsApp chat feed view matching Screenshot 1
router.get('/feed', (req: Request, res: Response) => {
  const campaigns = db.prepare(`
    SELECT c.*, t.name as template_name, t.body_text as template_body
    FROM campaigns c
    LEFT JOIN message_templates t ON c.template_id = t.id
    ORDER BY c.created_at DESC
  `).all() as any[];

  const feed = campaigns.map((c) => {
    const total = c.total_recipients || 1;
    const recipientCounts = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status IN ('ACCEPTED', 'DELIVERED', 'READ', 'SENT') THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
        COUNT(CASE WHEN status IN ('QUEUED', 'SUBMITTED') THEN 1 END) as pending
      FROM campaign_recipients
      WHERE campaign_id = ?
    `).get(c.id) as any;

    const sent = Math.min(total, recipientCounts?.sent || c.sent_count || 0);
    const failed = Math.min(total - sent, recipientCounts?.failed || c.failed_count || 0);
    const pending = Math.max(0, total - (sent + failed));
    const isDone = c.status === 'COMPLETED' || (sent + failed >= total && total > 0);
    const isStopped = c.status === 'PAUSED' || c.status === 'CANCELLED';
    const statusLabel = isDone ? 'Done' : isStopped ? 'Stopped' : 'In Progress';
    const statusSummary = isDone
      ? `Done — ${sent} delivered${failed > 0 ? `, ${failed} failed` : ''}`
      : `${statusLabel} — ${sent} sent, ${pending} pending${failed > 0 ? `, ${failed} failed` : ''}`;

    const textContent = c.custom_message || c.template_body || 'Marketing message';

    return {
      id: c.id,
      name: c.name,
      message_text: textContent,
      message_snippet: textContent,
      media_name: c.media_name,
      media_url: c.media_url,
      status: c.status,
      status_label: statusLabel,
      total_count: total,
      total_recipients: total,
      people_count: `${total} ${total === 1 ? 'person' : 'people'}`,
      summary_line: statusSummary,
      status_summary: statusSummary,
      created_at: c.created_at,
      created_time: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      sent_count: sent,
      delivered_count: sent,
      read_count: c.read_count || 0,
      failed_count: failed
    };
  });

  res.json({ feed });
});

// GET /api/campaigns/:id/who-got-what - Exact 'Who got what' recipient delivery ledger
router.get('/:id/who-got-what', (req: Request, res: Response): any => {
  const id = req.params.id as string;
  const filter = (req.query.status as string || 'ALL').toUpperCase();
  const search = (req.query.q as string || '').trim();
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '50', 10);
  const offset = (page - 1) * limit;

  const campaign = db.prepare(`
    SELECT c.*, t.name as template_name, t.body_text as template_body
    FROM campaigns c
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(id) as any;

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  let where = 'campaign_id = ?';
  const params: any[] = [id];

  if (filter !== 'ALL') {
    where += ' AND status = ?';
    params.push(filter);
  }

  if (search) {
    where += ' AND (customer_name LIKE ? OR phone_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM campaign_recipients WHERE ${where}`).get(...params) as any).count;
  const recipients = db.prepare(`
    SELECT * FROM campaign_recipients
    WHERE ${where}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM campaign_recipients
    WHERE campaign_id = ? GROUP BY status
  `).all(id);

  return res.json({
    campaign,
    recipients,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts
  });
});

// POST /api/campaigns/:id/retry-failed - Retry temporary failed recipients
router.post('/:id/retry-failed', (req: Request, res: Response): any => {
  const id = req.params.id as string;
  const retried = db.prepare(`
    UPDATE campaign_recipients
    SET status = 'QUEUED', error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE campaign_id = ? AND status = 'FAILED'
  `).run(id);

  db.prepare(`
    UPDATE campaigns
    SET status = 'IN_PROGRESS'
    WHERE id = ?
  `).run(id);

  return res.json({ success: true, retriedCount: retried.changes });
});

// POST /api/campaigns/quick-send - Fast direct broadcast from bottom composer
router.post('/quick-send', (req: Request, res: Response): any => {
  const { messageText, mediaName, mediaUrl, recipientPhones, templateId } = req.body;
  if (!messageText || !messageText.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  if (!BaileysService.getStatus().connected) {
    return res.status(400).json({
      error: 'WhatsApp is not connected! Please scan the QR code to connect your WhatsApp before sending messages.'
    });
  }

  // Find or default template
  let targetTplId = templateId;
  if (!targetTplId) {
    const defaultTpl = db.prepare("SELECT id FROM message_templates WHERE status = 'APPROVED' LIMIT 1").get() as any;
    targetTplId = defaultTpl?.id;
  }

  const sender = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1 LIMIT 1').get() as any;
  const campId = uuidv4();

  // Find recipients: either specified phones or eligible database contacts
  let targetContacts: any[] = [];
  if (recipientPhones && Array.isArray(recipientPhones) && recipientPhones.length > 0) {
    for (const p of recipientPhones) {
      let norm = String(p).replace(/[^\d]/g, '');
      if (norm.length === 10) norm = `91${norm}`;
      else if (norm.length === 11 && norm.startsWith('0')) norm = `91${norm.substring(1)}`;

      if (!norm) continue;

      let contact = db.prepare('SELECT id, name FROM contacts WHERE normalized_phone = ? LIMIT 1').get(norm) as any;
      if (!contact) {
        const newId = uuidv4();
        db.prepare(`
          INSERT INTO contacts (id, name, raw_phone, normalized_phone, consent_status, contact_status, do_not_contact)
          VALUES (?, ?, ?, ?, 'OPTED_IN', 'VALID', 0)
        `).run(newId, String(p), String(p), norm);
        contact = { id: newId, name: String(p) };
      }

      targetContacts.push({
        id: contact.id,
        name: contact.name || 'Valued Customer',
        normalized_phone: norm
      });
    }
  } else {
    targetContacts = db.prepare(`
      SELECT id, name, normalized_phone FROM contacts
      WHERE consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'
      LIMIT 1000
    `).all() as any[];
  }

  if (targetContacts.length === 0) {
    return res.status(400).json({ error: 'No eligible recipients found. Please import contacts or paste numbers.' });
  }

  const campTitle = `Broadcast - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  db.prepare(`
    INSERT INTO campaigns (
      id, name, sender_id, template_id, contact_segment, total_recipients,
      status, custom_message, media_name, media_url, created_at
    ) VALUES (?, ?, ?, ?, 'ELIGIBLE', ?, 'QUEUED', ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    campId,
    campTitle,
    sender?.id,
    targetTplId,
    targetContacts.length,
    messageText.trim(),
    mediaName || null,
    mediaUrl || null
  );

  const insertRecipientStmt = db.prepare(`
    INSERT INTO campaign_recipients (
      id, campaign_id, contact_id, phone_number, customer_name,
      template_parameters_json, status, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${campId}_${item.normalized_phone}`)
        .digest('hex');

      insertRecipientStmt.run(
        uuidv4(),
        campId,
        item.id,
        item.normalized_phone,
        item.name || 'Valued Customer',
        JSON.stringify([item.name || 'Valued Customer']),
        idempotencyKey
      );
    }
  });

  tx(targetContacts);

  // QueueService will process the queued recipients sequentially with anti-ban safety
  return res.json({
    success: true,
    campaignId: campId,
    totalRecipients: targetContacts.length
  });
});

// GET /api/campaigns/pacing-status - Live WhatsApp Anti-Ban speed pacing telemetry
router.get('/pacing-status', (req: Request, res: Response): any => {
  return res.json({ success: true, pacing: QueueService.getPacingStatus() });
});

// POST /api/campaigns/upload-broadcast - Upload Excel file to broadcast WhatsApp personal messages to all contacts
router.post('/upload-broadcast', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'media', maxCount: 1 }]), async (req: Request, res: Response): Promise<any> => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const excelFile = files?.file?.[0];
  const mediaFile = files?.media?.[0];
  const messageText = (req.body.messageText || '').trim();
  const userPhoneCol = (req.body.phoneColumn || '').trim().toLowerCase();
  const userNameCol = (req.body.nameColumn || '').trim().toLowerCase();

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
    const validRecipients: { id: string; name: string; normalized_phone: string }[] = [];

    // Detect header column indices if first row has text headers
    let phoneColIdx = -1;
    let nameColIdx = -1;

    if (rows.length > 0 && Array.isArray(rows[0])) {
      const headerRow = rows[0].map((h: any) => String(h || '').trim().toLowerCase());
      
      // Check user specified columns first
      if (userPhoneCol) {
        phoneColIdx = headerRow.findIndex((h: string) => h === userPhoneCol || h.includes(userPhoneCol));
      }
      if (userNameCol) {
        nameColIdx = headerRow.findIndex((h: string) => h === userNameCol || h.includes(userNameCol));
      }

      // Auto-detect if not matched
      if (phoneColIdx === -1) {
        phoneColIdx = headerRow.findIndex((h: string) => 
          h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact') || h.includes('फोन') || h.includes('मोबाइल')
        );
      }
      if (nameColIdx === -1) {
        nameColIdx = headerRow.findIndex((h: string) => 
          h.includes('name') || h.includes('customer') || h.includes('client') || h.includes('naam') || h.includes('नाम') || h.includes('ग्राहक')
        );
      }
    }

    const startRowIdx = (phoneColIdx !== -1 || nameColIdx !== -1) ? 1 : 0;

    for (let r = startRowIdx; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let foundPhone: string | null = null;
      let foundName: string | null = null;

      // 1. Try header indices if matched
      if (phoneColIdx !== -1 && row[phoneColIdx] !== undefined) {
        const norm = normalizePhoneNumber(String(row[phoneColIdx]).trim(), '91');
        if (norm.isValid && norm.isMobile) {
          foundPhone = norm.normalized;
        }
      }
      if (nameColIdx !== -1 && row[nameColIdx] !== undefined) {
        const rawN = String(row[nameColIdx]).trim();
        if (rawN && !/^\d+$/.test(rawN) && rawN.length >= 2 && rawN.length <= 60) {
          foundName = rawN;
        }
      }

      // 2. Fallback: inspect each cell in the row
      if (!foundPhone) {
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;
          const norm = normalizePhoneNumber(String(cell).trim(), '91');
          if (norm.isValid && norm.isMobile) {
            foundPhone = norm.normalized;
            break;
          }
        }
      }

      if (foundPhone && !foundName) {
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;
          const str = String(cell).trim();
          // Filter out phone numbers, pure digits, URLs, emails, and typical table headers
          if (
            str.length >= 2 &&
            str.length <= 60 &&
            !/^\+?\d+$/.test(str) &&
            !str.includes('@') &&
            !str.includes('http') &&
            !['name', 'phone', 'mobile', 'sr', 's.no', 'sr no', 'id', 'customer', 'status'].includes(str.toLowerCase()) &&
            /[a-zA-Z\u0900-\u097F]/.test(str)
          ) {
            foundName = str;
            break;
          }
        }
      }

      if (foundPhone && !seen.has(foundPhone)) {
        seen.add(foundPhone);
        validRecipients.push({
          id: uuidv4(),
          name: foundName || 'Valued Customer',
          normalized_phone: foundPhone
        });
      }
    }

    if (validRecipients.length === 0) {
      return res.status(400).json({ error: 'No valid mobile phone numbers found in the uploaded Excel file.' });
    }

    // Guarantee template and sender exist
    let defaultTpl = db.prepare("SELECT id FROM message_templates WHERE status = 'APPROVED' LIMIT 1").get() as any;
    if (!defaultTpl) {
      defaultTpl = db.prepare("SELECT id FROM message_templates LIMIT 1").get() as any;
    }
    const sender = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1 LIMIT 1').get() as any;
    const campId = uuidv4();
    const campTitle = `Excel Broadcast (${validRecipients.length} contacts) — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    db.prepare(`
      INSERT INTO campaigns (
        id, name, sender_id, template_id, contact_segment, total_recipients,
        status, custom_message, media_name, media_url, created_at
      ) VALUES (?, ?, ?, ?, 'EXCEL_UPLOAD', ?, 'QUEUED', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      campId,
      campTitle,
      sender?.id || null,
      defaultTpl?.id,
      validRecipients.length,
      messageText,
      mediaFile?.originalname || null,
      mediaFile?.path || null
    );

    const insertRecipientStmt = db.prepare(`
      INSERT INTO campaign_recipients (
        id, campaign_id, contact_id, phone_number, customer_name,
        template_parameters_json, status, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)
    `);

    const tx = db.transaction((items) => {
      for (const item of items) {
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${campId}_${item.normalized_phone}`)
          .digest('hex');

        insertRecipientStmt.run(
          uuidv4(),
          campId,
          null, // contact_id must be null for direct Excel uploads to avoid foreign key errors
          item.normalized_phone,
          item.name,
          JSON.stringify([item.name]),
          idempotencyKey
        );
      }
    });

    tx(validRecipients);

    return res.json({
      success: true,
      campaignId: campId,
      totalRecipients: validRecipients.length,
      fileName: excelFile.originalname,
      message: `Successfully queued ${validRecipients.length.toLocaleString()} contacts in Anti-Ban Safe Mode (10–15 messages/hour)!`
    });
  } catch (err: any) {
    console.error('[WhatsApp Excel Broadcast Error]:', err);
    return res.status(500).json({ error: err?.message || 'Failed to process Excel file' });
  }
});

// GET /api/campaigns/:id - Get campaign details & recipients
router.get('/:id', (req: Request, res: Response): any => {
  const { id } = req.params;
  const campaign = db.prepare(`
    SELECT c.*, t.name as template_name, t.body_text, t.status as template_status, s.display_phone_number as sender_phone
    FROM campaigns c
    LEFT JOIN message_templates t ON c.template_id = t.id
    LEFT JOIN whatsapp_senders s ON c.sender_id = s.id
    WHERE c.id = ?
  `).get(id) as any;

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found.' });
  }

  // Fetch recipients breakdown
  const recipients = db.prepare(`
    SELECT id, phone_number, customer_name, status, message_id, error_message, sent_at, delivered_at, read_at
    FROM campaign_recipients
    WHERE campaign_id = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).all(id);

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM campaign_recipients
    WHERE campaign_id = ?
    GROUP BY status
  `).all(id);

  return res.json({
    campaign,
    recipients,
    statusCounts
  });
});

// POST /api/campaigns/estimate - Pre-flight audience & cost estimator
router.post('/estimate', (req: Request, res: Response): any => {
  const { templateId, contactSegment = 'ELIGIBLE' } = req.body;

  let whereClause = "consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'";
  if (contactSegment === 'ALL') {
    whereClause = "do_not_contact = 0 AND contact_status = 'VALID'";
  }

  const eligibleCount = (db.prepare(`SELECT COUNT(*) as count FROM contacts WHERE ${whereClause}`).get() as any).count;
  const sampleContacts = db.prepare(`SELECT name, normalized_phone FROM contacts WHERE ${whereClause} LIMIT 3`).all() as any[];

  let templateText = 'Hello {{1}}, check out DLB AUTO offers!';
  if (templateId) {
    const tpl = db.prepare('SELECT body_text, status FROM message_templates WHERE id = ?').get(templateId) as any;
    if (tpl) {
      templateText = tpl.body_text;
    }
  }

  const previews = sampleContacts.map((c) => ({
    name: c.name,
    phone: c.normalized_phone,
    renderedMessage: templateText.replace(/\{\{1\}\}/g, c.name || 'Valued Customer')
  }));

  // Indian standard Meta marketing conversation rate ~ ₹0.78
  const estimatedCostInr = (eligibleCount * 0.78).toFixed(2);

  return res.json({
    eligibleCount,
    estimatedCostInr,
    previews
  });
});

// POST /api/campaigns - Create and queue campaign
router.post('/', (req: Request, res: Response): any => {
  const { name, senderId, templateId, contactSegment = 'ELIGIBLE' } = req.body;

  if (!name || !templateId) {
    return res.status(400).json({ error: 'Campaign name and template are required.' });
  }

  // 1. Verify Template is APPROVED
  const template = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(templateId) as any;
  if (!template) {
    return res.status(400).json({ error: 'Selected template does not exist.' });
  }
  if (template.status !== 'APPROVED') {
    return res.status(400).json({
      error: `Cannot launch campaign with template '${template.name}'. Current status is '${template.status}' (Must be APPROVED by Meta).`
    });
  }

  // 2. Select default sender if not provided
  let targetSenderId = senderId;
  if (!targetSenderId) {
    const defaultSender = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1 LIMIT 1').get() as { id: string } | undefined;
    targetSenderId = defaultSender?.id;
  }

  // 3. Select strictly eligible contacts (enforcing consent and opt-out exclusions)
  let whereClause = "consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'";
  if (contactSegment === 'ALL') {
    // Even if ALL is chosen, DNC must strictly be excluded
    whereClause = "do_not_contact = 0 AND contact_status = 'VALID'";
  }

  const recipients = db.prepare(`
    SELECT id, name, normalized_phone FROM contacts
    WHERE ${whereClause}
  `).all() as Array<{ id: string; name: string; normalized_phone: string }>;

  if (recipients.length === 0) {
    return res.status(400).json({
      error: 'No eligible recipients found. Contacts must have affirmative opt-in consent and must not have opted out.'
    });
  }

  const campaignId = uuidv4();

  // 4. Insert Campaign
  db.prepare(`
    INSERT INTO campaigns (
      id, name, sender_id, template_id, contact_segment, total_recipients, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', CURRENT_TIMESTAMP)
  `).run(
    campaignId,
    name,
    targetSenderId,
    templateId,
    contactSegment,
    recipients.length
  );

  // 5. Populate campaign_recipients with idempotency keys in a fast transaction
  const insertRecipientStmt = db.prepare(`
    INSERT INTO campaign_recipients (
      id, campaign_id, contact_id, phone_number, customer_name,
      template_parameters_json, status, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)
  `);

  const populateTransaction = db.transaction((items) => {
    for (const item of items) {
      // Idempotency key hash prevents duplicate send
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${campaignId}_${item.normalized_phone}`)
        .digest('hex');

      insertRecipientStmt.run(
        uuidv4(),
        campaignId,
        item.id,
        item.normalized_phone,
        item.name || 'Valued Customer',
        JSON.stringify([item.name || 'Valued Customer']),
        idempotencyKey
      );
    }
  });

  populateTransaction(recipients);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
    VALUES (?, 'system', 'CAMPAIGN_QUEUED', 'campaign', ?, ?)
  `).run(uuidv4(), campaignId, JSON.stringify({ name, totalRecipients: recipients.length }));

  const createdCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  return res.status(201).json(createdCampaign);
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', (req: Request, res: Response) => {
  const id = req.params.id as string;
  QueueService.pauseCampaign(id);
  res.json({ success: true, message: 'Campaign paused.' });
});

// POST /api/campaigns/:id/resume
router.post('/:id/resume', (req: Request, res: Response) => {
  const id = req.params.id as string;
  QueueService.resumeCampaign(id);
  res.json({ success: true, message: 'Campaign resumed.' });
});

// POST /api/campaigns/:id/cancel
router.post('/:id/cancel', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const count = QueueService.cancelCampaign(id);
  res.json({ success: true, message: `Campaign cancelled. ${count} pending messages stopped.` });
});

// DELETE /api/campaigns/:id - Delete a campaign and its recipient history
router.delete('/:id', (req: Request, res: Response): any => {
  const id = req.params.id as string;
  try {
    db.prepare('DELETE FROM campaign_recipients WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Campaign deleted successfully.' });
  } catch (err: any) {
    console.error('[CampaignRoutes] Delete error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete campaign.' });
  }
});

export default router;
