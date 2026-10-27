import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { MetaWhatsAppService } from '../services/metaWhatsAppService';
import { config } from '../config/env';

const router = Router();

// GET /api/whatsapp/status
router.get('/status', (req: Request, res: Response) => {
  const sender = db.prepare(`
    SELECT s.*, b.business_name, b.meta_waba_id, b.messaging_tier, b.account_status, b.timezone, b.currency, b.system_user_token
    FROM whatsapp_senders s
    JOIN business_accounts b ON s.business_account_id = b.id
    WHERE s.is_default = 1
    LIMIT 1
  `).get() as any;

  if (!sender) {
    return res.json({
      connected: false,
      state: 'NOT_CONNECTED',
      businessName: 'DLB AUTO MARKETING',
      sender: null
    });
  }

  const isConnected = sender.connection_status === 'CONNECTED';
  const effectiveToken = sender.system_user_token || config.meta.systemUserToken || '';
  // Obfuscate token for security (never expose full token to frontend)
  const tokenMasked = effectiveToken
    ? `${effectiveToken.substring(0, 6)}...${effectiveToken.substring(Math.max(0, effectiveToken.length - 4))}`
    : null;

  const hasRealWaba = Boolean(sender.meta_waba_id && !sender.meta_waba_id.startsWith('WABA_DLB_AUTO_10928374'));
  const hasRealPhoneId = Boolean(sender.phone_number_id && !sender.phone_number_id.startsWith('PHONE_ID_919876500000'));
  const hasToken = Boolean(effectiveToken && effectiveToken.length > 20);

  res.json({
    connected: isConnected,
    state: sender.connection_status,
    businessName: sender.business_name,
    wabaId: sender.meta_waba_id,
    phoneNumberId: sender.phone_number_id,
    displayPhoneNumber: sender.display_phone_number,
    verifiedName: sender.verified_name,
    qualityRating: sender.quality_rating,
    messagingTier: sender.messaging_tier,
    connectionError: sender.connection_error_detail,
    lastVerifiedAt: sender.last_verified_at,
    hasTokenConfigured: hasToken,
    tokenMasked,
    webhookUrl: `/webhook`,
    webhookVerifyToken: config.meta.webhookVerifyToken,
    diagnostics: {
      wabaConfigured: hasRealWaba,
      phoneIdConfigured: hasRealPhoneId,
      tokenConfigured: hasToken,
      databasePersisted: true
    }
  });
});

// POST /api/whatsapp/verify - Run live Meta Graph API diagnostic check
router.post('/verify', async (req: Request, res: Response) => {
  const sender = db.prepare(`
    SELECT s.*, b.system_user_token, b.meta_waba_id, b.id as b_id
    FROM whatsapp_senders s
    JOIN business_accounts b ON s.business_account_id = b.id
    WHERE s.is_default = 1
    LIMIT 1
  `).get() as any;

  if (!sender) {
    return res.status(400).json({ error: 'No WhatsApp sender profile configured.' });
  }

  const tokenToUse = sender.system_user_token || config.meta.systemUserToken;
  const statusResult = await MetaWhatsAppService.verifyConnection(
    sender.meta_waba_id,
    sender.phone_number_id,
    tokenToUse
  );

  // Update sender record with verified status
  db.prepare(`
    UPDATE whatsapp_senders
    SET connection_status = ?,
        quality_rating = ?,
        connection_error_detail = ?,
        last_verified_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    statusResult.state,
    statusResult.qualityRating,
    statusResult.errorDetail || null,
    sender.id
  );

  // Update business account messaging tier
  if (statusResult.connected) {
    db.prepare(`
      UPDATE business_accounts
      SET account_status = 'ACTIVE', messaging_tier = ?
      WHERE id = ?
    `).run(statusResult.messagingTier, sender.b_id);
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
    VALUES (?, 'system', 'VERIFY_WHATSAPP_CONNECTION', 'whatsapp_sender', ?, ?)
  `).run(uuidv4(), sender.id, JSON.stringify(statusResult));

  res.json(statusResult);
});

// POST /api/whatsapp/connect - Update credentials or complete Embedded Signup
router.post('/connect', async (req: Request, res: Response): Promise<any> => {
  const { wabaId, phoneNumberId, systemUserToken, displayPhoneNumber, verifiedName } = req.body;

  if (!wabaId || !phoneNumberId) {
    return res.status(400).json({ error: 'WABA ID and Phone Number ID are required.' });
  }

  // Test credentials with Meta
  const tokenToUse = systemUserToken || config.meta.systemUserToken;
  const verification = await MetaWhatsAppService.verifyConnection(wabaId, phoneNumberId, tokenToUse);

  // Update or insert business account
  let bAccount = db.prepare('SELECT id FROM business_accounts LIMIT 1').get() as { id: string } | undefined;
  let bAccountId = bAccount?.id;

  if (!bAccountId) {
    bAccountId = uuidv4();
    db.prepare(`
      INSERT INTO business_accounts (
        id, meta_waba_id, business_name, system_user_token, account_status, messaging_tier
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      bAccountId,
      wabaId,
      verification.businessName || 'DLB AUTO MARKETING',
      systemUserToken || null,
      verification.connected ? 'ACTIVE' : 'PENDING',
      verification.messagingTier
    );
  } else {
    db.prepare(`
      UPDATE business_accounts
      SET meta_waba_id = ?,
          system_user_token = COALESCE(?, system_user_token),
          account_status = ?,
          messaging_tier = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      wabaId,
      systemUserToken || null,
      verification.connected ? 'ACTIVE' : 'PENDING',
      verification.messagingTier,
      bAccountId
    );
  }

  // Update or insert sender
  let sender = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1').get() as { id: string } | undefined;
  if (!sender) {
    db.prepare(`
      INSERT INTO whatsapp_senders (
        id, business_account_id, phone_number_id, display_phone_number, verified_name,
        quality_rating, connection_status, is_default, connection_error_detail, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(
      uuidv4(),
      bAccountId,
      phoneNumberId,
      displayPhoneNumber || verification.displayPhoneNumber || '+91 98765 00000',
      verifiedName || verification.businessName || 'DLB AUTO MARKETING',
      verification.qualityRating,
      verification.state,
      verification.errorDetail || null
    );
  } else {
    db.prepare(`
      UPDATE whatsapp_senders
      SET phone_number_id = ?,
          display_phone_number = COALESCE(?, display_phone_number),
          verified_name = COALESCE(?, verified_name),
          quality_rating = ?,
          connection_status = ?,
          connection_error_detail = ?,
          last_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      phoneNumberId,
      displayPhoneNumber || verification.displayPhoneNumber,
      verifiedName || verification.businessName,
      verification.qualityRating,
      verification.state,
      verification.errorDetail || null,
      sender.id
    );
  }

  return res.json({
    success: verification.connected,
    status: verification
  });
});

// POST /api/whatsapp/disconnect - Safely disconnect
router.post('/disconnect', (req: Request, res: Response) => {
  db.prepare(`
    UPDATE whatsapp_senders
    SET connection_status = 'DISCONNECTED',
        connection_error_detail = 'User disconnected account'
    WHERE is_default = 1
  `).run();

  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
    VALUES (?, 'system', 'DISCONNECT_WHATSAPP', 'whatsapp_sender', 'default', '{}')
  `).run(uuidv4());

  res.json({ success: true, message: 'WhatsApp account disconnected.' });
});

// POST /api/whatsapp/test-message - Send authorized live test message
router.post('/test-message', async (req: Request, res: Response): Promise<any> => {
  const { recipientPhone, templateName } = req.body;
  if (!recipientPhone) {
    return res.status(400).json({ error: 'Recipient phone number is required.' });
  }

  const sender = db.prepare(`
    SELECT s.*, b.system_user_token
    FROM whatsapp_senders s
    JOIN business_accounts b ON s.business_account_id = b.id
    WHERE s.is_default = 1
    LIMIT 1
  `).get() as any;

  if (!sender) {
    return res.status(400).json({ error: 'No WhatsApp sender profile connected.' });
  }

  const tokenToUse = sender.system_user_token || config.meta.systemUserToken;
  const tplName = templateName || 'dlb_exclusive_deals';

  const sendRes = await MetaWhatsAppService.sendTemplateMessage({
    phoneNumberId: sender.phone_number_id,
    systemUserToken: tokenToUse,
    to: recipientPhone.replace(/[^\d]/g, ''),
    templateName: tplName,
    languageCode: 'en_US',
    variables: ['Valued Client']
  });

  if (sendRes.success && sendRes.wamid) {
    db.prepare(`
      INSERT INTO message_records (
        id, wamid, sender_id, recipient_phone, direction, message_type, content, template_name, status, pricing_category, sent_at
      ) VALUES (?, ?, ?, ?, 'OUTBOUND', 'TEMPLATE', ?, ?, 'SENT', 'marketing', CURRENT_TIMESTAMP)
    `).run(
      uuidv4(),
      sendRes.wamid,
      sender.id,
      recipientPhone,
      `Test Message: ${tplName}`,
      tplName
    );

    return res.json({
      success: true,
      wamid: sendRes.wamid,
      message: `Test message dispatched successfully to ${recipientPhone}`
    });
  } else {
    return res.status(400).json({
      success: false,
      error: sendRes.error || 'Failed to dispatch test message via Meta API'
    });
  }
});

export default router;
