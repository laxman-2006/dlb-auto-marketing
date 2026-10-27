import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { MetaWhatsAppService } from '../services/metaWhatsAppService';
import { config } from '../config/env';

const router = Router();

// GET /api/conversations - List conversations
router.get('/', (req: Request, res: Response) => {
  const conversations = db.prepare(`
    SELECT * FROM conversations
    ORDER BY last_message_timestamp DESC
  `).all();
  res.json({ conversations });
});

// GET /api/conversations/:id/messages - Get chat history
router.get('/:id/messages', (req: Request, res: Response): any => {
  const { id } = req.params;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  // Clear unread count on open
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(id);

  const messages = db.prepare(`
    SELECT * FROM chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(id);

  const isWindowActive = conversation.customer_service_window_expires_at
    ? new Date(conversation.customer_service_window_expires_at) > new Date()
    : false;

  return res.json({
    conversation,
    isWindowActive,
    windowExpiresAt: conversation.customer_service_window_expires_at,
    messages
  });
});

// POST /api/conversations/:id/reply - Send reply with 24-hour window enforcement
router.post('/:id/reply', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  // Check if contact has opted out
  if (conversation.is_opted_out === 1) {
    return res.status(403).json({
      error: 'Cannot reply to this contact. The recipient sent STOP / opted out.'
    });
  }

  // Check 24-hour Customer Service Window
  const isWindowActive = conversation.customer_service_window_expires_at
    ? new Date(conversation.customer_service_window_expires_at) > new Date()
    : false;

  if (!isWindowActive) {
    return res.status(403).json({
      error: 'The 24-hour customer service window has expired. WhatsApp policy requires sending an approved Message Template to initiate a new session.'
    });
  }

  const sender = db.prepare(`
    SELECT s.*, b.system_user_token
    FROM whatsapp_senders s
    JOIN business_accounts b ON s.business_account_id = b.id
    WHERE s.is_default = 1
    LIMIT 1
  `).get() as any;

  if (!sender) {
    return res.status(400).json({ error: 'No WhatsApp sender connected.' });
  }

  const tokenToUse = sender.system_user_token || config.meta.systemUserToken;

  const sendResult = await MetaWhatsAppService.sendSessionTextMessage({
    phoneNumberId: sender.phone_number_id,
    systemUserToken: tokenToUse,
    to: conversation.phone_number,
    text: text.trim()
  });

  if (sendResult.success) {
    const msgId = uuidv4();
    db.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, wamid, direction, sender_phone, recipient_phone,
        message_type, text_content, status
      ) VALUES (?, ?, ?, 'OUTBOUND', ?, ?, 'TEXT', ?, 'SENT')
    `).run(
      msgId,
      id,
      sendResult.wamid || `wamid_${Date.now()}`,
      sender.display_phone_number,
      conversation.phone_number,
      text.trim()
    );

    db.prepare(`
      UPDATE conversations
      SET last_message_text = ?,
          last_message_direction = 'OUTBOUND',
          last_message_timestamp = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(text.trim(), id);

    return res.json({
      success: true,
      wamid: sendResult.wamid,
      message: 'Reply sent successfully.'
    });
  } else {
    return res.status(500).json({
      error: sendResult.error || 'Failed to deliver message via WhatsApp Cloud API.'
    });
  }
});

export default router;
