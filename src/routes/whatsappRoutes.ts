import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { BaileysService } from '../services/baileysService';
import { MetaWhatsAppService } from '../services/metaWhatsAppService';
import { config } from '../config/env';

const router = Router();

// GET /api/whatsapp/status - Live WhatsApp Web Multi-Device connection & QR status
router.get('/status', (req: Request, res: Response) => {
  const baileys = BaileysService.getStatus();

  const sender = db.prepare(`
    SELECT s.*, b.business_name
    FROM whatsapp_senders s
    JOIN business_accounts b ON s.business_account_id = b.id
    WHERE s.is_default = 1
    LIMIT 1
  `).get() as any;

  const isConnected = baileys.connected || (sender && sender.connection_status === 'CONNECTED');
  const displayPhone = baileys.connected
    ? baileys.displayPhoneNumber
    : (sender?.display_phone_number || '+91 98765 00000');

  res.json({
    connected: isConnected,
    state: isConnected ? 'CONNECTED' : (baileys.state || 'NOT_CONNECTED'),
    qrCodeDataUrl: baileys.qrCodeDataUrl,
    displayPhoneNumber: displayPhone,
    verifiedName: baileys.verifiedName || sender?.verified_name || 'DLB AUTO MARKETING',
    businessName: sender?.business_name || 'DLB AUTO MARKETING',
    lastVerifiedAt: new Date().toISOString()
  });
});

// POST /api/whatsapp/verify - Run live WhatsApp Web connection check
router.post('/verify', async (req: Request, res: Response) => {
  const baileys = BaileysService.getStatus();

  if (baileys.connected) {
    db.prepare(`
      UPDATE whatsapp_senders
      SET connection_status = 'CONNECTED',
          display_phone_number = ?,
          last_verified_at = CURRENT_TIMESTAMP
      WHERE is_default = 1
    `).run(baileys.displayPhoneNumber);

    return res.json({
      connected: true,
      state: 'CONNECTED',
      displayPhoneNumber: baileys.displayPhoneNumber,
      verifiedName: baileys.verifiedName,
      message: 'WhatsApp is connected and verified!'
    });
  } else {
    // If not connected, make sure socket is actively waiting for scan
    BaileysService.init();

    return res.json({
      connected: false,
      state: 'NOT_CONNECTED',
      qrCodeDataUrl: baileys.qrCodeDataUrl,
      errorDetail: 'Please scan the displayed QR code with WhatsApp on your phone (WhatsApp → Linked Devices → Link a Device).'
    });
  }
});

// POST /api/whatsapp/disconnect - Safely disconnect WhatsApp Web session
router.post('/disconnect', async (req: Request, res: Response) => {
  await BaileysService.disconnect();

  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
    VALUES (?, 'system', 'DISCONNECT_WHATSAPP', 'whatsapp_sender', 'default', '{}')
  `).run(uuidv4());

  res.json({ success: true, message: 'WhatsApp session disconnected.' });
});

// POST /api/whatsapp/test-message - Send live test message through connected WhatsApp
router.post('/test-message', async (req: Request, res: Response): Promise<any> => {
  const { recipientPhone, messageText } = req.body;
  if (!recipientPhone) {
    return res.status(400).json({ error: 'Recipient phone number is required.' });
  }

  const cleanPhone = String(recipientPhone).replace(/[^\d]/g, '');
  if (!cleanPhone) {
    return res.status(400).json({ success: false, error: 'Invalid recipient phone number format.' });
  }

  const text = messageText || 'Hello from DLB AUTO MARKETING! Your WhatsApp connection is active and working.';

  // Attempt dispatch via connected WhatsApp Web session
  const sendRes = await BaileysService.sendMessage(cleanPhone, text);

  if (sendRes.success && sendRes.wamid) {
    const senderRecord = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1 LIMIT 1').get() as any;
    db.prepare(`
      INSERT INTO message_records (
        id, wamid, sender_id, recipient_phone, direction, message_type, content, status, pricing_category, sent_at
      ) VALUES (?, ?, ?, ?, 'OUTBOUND', 'TEXT', ?, 'SENT', 'marketing', CURRENT_TIMESTAMP)
    `).run(
      uuidv4(),
      sendRes.wamid,
      senderRecord?.id,
      recipientPhone,
      text
    );

    return res.json({
      success: true,
      wamid: sendRes.wamid,
      message: `Test message dispatched successfully to ${recipientPhone}`
    });
  } else {
    return res.status(400).json({
      success: false,
      error: sendRes.error || 'WhatsApp is not connected. Please scan the QR code in Settings first.'
    });
  }
});

export default router;
