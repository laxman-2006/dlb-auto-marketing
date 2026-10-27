import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../db/database';
import { QueueService } from '../services/queueService';

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
    const sent = c.sent_count || 0;
    const notSent = Math.max(0, (c.total_recipients || 0) - sent);
    const isDone = c.status === 'COMPLETED' || (sent > 0 && notSent === 0);
    const isStopped = c.status === 'PAUSED' || c.status === 'CANCELLED';
    const statusLabel = isDone ? 'Done' : isStopped ? 'Stopped' : 'In Progress';
    const statusSummary = isDone
      ? `Done — ${sent} sent`
      : `${statusLabel} — ${sent} sent, ${notSent} not sent`;

    return {
      id: c.id,
      name: c.name,
      message_text: c.custom_message || c.template_body || 'Marketing message',
      media_name: c.media_name,
      media_url: c.media_url,
      status: c.status,
      status_label: statusLabel,
      people_count: `${c.total_recipients || 1} ${c.total_recipients === 1 ? 'person' : 'people'}`,
      status_summary: statusSummary,
      created_at: c.created_at,
      total_recipients: c.total_recipients,
      sent_count: c.sent_count,
      delivered_count: c.delivered_count,
      read_count: c.read_count,
      failed_count: c.failed_count
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
      targetContacts.push({
        id: uuidv4(),
        name: 'Valued Customer',
        normalized_phone: p
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

  return res.json({
    success: true,
    campaignId: campId,
    totalRecipients: targetContacts.length
  });
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

export default router;
