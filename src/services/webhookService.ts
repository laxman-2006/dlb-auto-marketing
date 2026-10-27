import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../db/database';
import { config } from '../config/env';

export class WebhookService {
  /**
   * Validates Meta X-Hub-Signature-256 HMAC header
   */
  public static verifySignature(rawBody: string, signatureHeader?: string): boolean {
    if (!config.meta.appSecret || !signatureHeader) {
      // If secret not configured in local environment, allow pass
      return true;
    }
    const elements = signatureHeader.split('=');
    const signature = elements[1];
    const expectedSignature = crypto
      .createHmac('sha256', config.meta.appSecret)
      .update(rawBody)
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Processes verified incoming Meta WhatsApp Webhook payload
   */
  public static processWebhookPayload(payload: any) {
    const eventId = uuidv4();
    const eventType = payload.object || 'whatsapp_business_account';

    // Store raw event in webhook_events ledger
    db.prepare(`
      INSERT INTO webhook_events (id, event_type, payload_json, processed_status)
      VALUES (?, ?, ?, 'PROCESSED')
    `).run(eventId, eventType, JSON.stringify(payload));

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === 'messages') {
          const value = change.value;
          
          // 1. Process delivery and read receipts (statuses)
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              this.handleStatusUpdate(statusObj);
            }
          }

          // 2. Process inbound customer messages
          if (value.messages && Array.isArray(value.messages)) {
            for (const msgObj of value.messages) {
              const contactMetadata = value.contacts?.[0] || {};
              this.handleInboundMessage(msgObj, contactMetadata, value.metadata);
            }
          }
        }
      }
    }
  }

  /**
   * Handles delivery, read, and failure status updates from Meta
   */
  private static handleStatusUpdate(statusObj: any) {
    const wamid = statusObj.id;
    const status = statusObj.status?.toUpperCase(); // SENT, DELIVERED, READ, FAILED
    const timestamp = statusObj.timestamp ? new Date(parseInt(statusObj.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

    if (!wamid || !status) return;

    // Update message_records
    if (status === 'SENT') {
      db.prepare(`
        UPDATE message_records
        SET status = 'SENT', sent_at = ?
        WHERE wamid = ?
      `).run(timestamp, wamid);
    } else if (status === 'DELIVERED') {
      db.prepare(`
        UPDATE message_records
        SET status = 'DELIVERED', delivered_at = ?
        WHERE wamid = ?
      `).run(timestamp, wamid);
    } else if (status === 'READ') {
      db.prepare(`
        UPDATE message_records
        SET status = 'READ', read_at = ?
        WHERE wamid = ?
      `).run(timestamp, wamid);
    } else if (status === 'FAILED') {
      const errorDetails = statusObj.errors?.[0] || {};
      db.prepare(`
        UPDATE message_records
        SET status = 'FAILED', error_code = ?, error_message = ?
        WHERE wamid = ?
      `).run(String(errorDetails.code || ''), errorDetails.title || 'Delivery failed', wamid);
    }

    // Update campaign_recipients if message belongs to a campaign
    const recipient = db.prepare(`
      SELECT id, campaign_id, status FROM campaign_recipients WHERE message_id = ?
    `).get(wamid) as { id: string; campaign_id: string; status: string } | undefined;

    if (recipient) {
      if (status === 'DELIVERED') {
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'DELIVERED', delivered_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(timestamp, recipient.id);

        db.prepare(`
          UPDATE campaigns
          SET delivered_count = delivered_count + 1
          WHERE id = ?
        `).run(recipient.campaign_id);
      } else if (status === 'READ') {
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'READ', read_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(timestamp, recipient.id);

        db.prepare(`
          UPDATE campaigns
          SET read_count = read_count + 1
          WHERE id = ?
        `).run(recipient.campaign_id);
      } else if (status === 'SENT') {
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'SENT', sent_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(timestamp, recipient.id);
      } else if (status === 'FAILED') {
        const errorDetails = statusObj.errors?.[0] || {};
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(errorDetails.title || 'Meta delivery failure', recipient.id);
      }
    }

    // Update chat_messages if present
    db.prepare(`
      UPDATE chat_messages
      SET status = ?
      WHERE wamid = ?
    `).run(status, wamid);
  }

  /**
   * Handles inbound customer message, checks for STOP opt-out, and updates 2-way chat conversation
   */
  private static handleInboundMessage(msgObj: any, contactMetadata: any, phoneMetadata: any) {
    const fromPhone = msgObj.from;
    const wamid = msgObj.id;
    const customerName = contactMetadata.profile?.name || 'Customer';
    const messageType = msgObj.type || 'text';
    let textContent = '';

    if (messageType === 'text') {
      textContent = msgObj.text?.body || '';
    } else if (messageType === 'button') {
      textContent = msgObj.button?.text || '';
    } else if (messageType === 'interactive') {
      textContent = msgObj.interactive?.button_reply?.title || msgObj.interactive?.list_reply?.title || '';
    }

    const trimmedUpper = textContent.trim().toUpperCase();

    // Find contact in DB or create a contact entry
    let contact = db.prepare('SELECT id, name, do_not_contact FROM contacts WHERE normalized_phone = ?').get(fromPhone) as any;
    if (!contact) {
      const newContactId = uuidv4();
      db.prepare(`
        INSERT INTO contacts (id, name, raw_phone, normalized_phone, consent_status, contact_status)
        VALUES (?, ?, ?, ?, 'CONSENT_REQUIRED', 'VALID')
      `).run(newContactId, customerName, fromPhone, fromPhone);
      contact = { id: newContactId, name: customerName, do_not_contact: 0 };
    }

    // Check for opt-out / STOP keywords
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'CANCEL', 'DND', 'END'];
    const isOptOut = optOutKeywords.includes(trimmedUpper);

    if (isOptOut) {
      console.log(`[Opt-Out] Contact ${fromPhone} requested opt-out with keyword: "${trimmedUpper}".`);

      // 1. Mark contact as Do Not Contact immediately
      db.prepare(`
        UPDATE contacts
        SET do_not_contact = 1, consent_status = 'OPTED_OUT', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(contact.id);

      // 2. Record in opt_out_records
      db.prepare(`
        INSERT INTO opt_out_records (id, contact_id, phone_number, trigger_word, raw_message, source)
        VALUES (?, ?, ?, ?, ?, 'INBOUND_WHATSAPP')
      `).run(uuidv4(), contact.id, fromPhone, trimmedUpper, textContent);

      // 3. Cancel any pending messages in campaigns for this phone number
      db.prepare(`
        UPDATE campaign_recipients
        SET status = 'CANCELLED', error_message = 'Cancelled due to recipient STOP opt-out'
        WHERE phone_number = ? AND status IN ('QUEUED')
      `).run(fromPhone);

      // 4. Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
        VALUES (?, 'system', 'RECIPIENT_OPTED_OUT', 'contact', ?, ?)
      `).run(uuidv4(), contact.id, JSON.stringify({ phone: fromPhone, triggerWord: trimmedUpper }));
    }

    // 24-hour Customer Service Window (starts at incoming message time)
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update or create conversation
    let conversation = db.prepare('SELECT id FROM conversations WHERE phone_number = ?').get(fromPhone) as { id: string } | undefined;
    let conversationId = conversation?.id;

    if (!conversationId) {
      conversationId = uuidv4();
      db.prepare(`
        INSERT INTO conversations (
          id, contact_id, phone_number, contact_name, last_message_text,
          last_message_direction, last_message_timestamp, unread_count,
          customer_service_window_expires_at, is_opted_out
        ) VALUES (?, ?, ?, ?, ?, 'INBOUND', CURRENT_TIMESTAMP, 1, ?, ?)
      `).run(conversationId, contact.id, fromPhone, customerName, textContent, windowExpiry, isOptOut ? 1 : 0);
    } else {
      db.prepare(`
        UPDATE conversations
        SET last_message_text = ?,
            last_message_direction = 'INBOUND',
            last_message_timestamp = CURRENT_TIMESTAMP,
            unread_count = unread_count + 1,
            customer_service_window_expires_at = ?,
            is_opted_out = ?,
            contact_name = COALESCE(?, contact_name)
        WHERE id = ?
      `).run(textContent, windowExpiry, isOptOut ? 1 : 0, customerName, conversationId);
    }

    // Store in chat_messages
    db.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, wamid, direction, sender_phone, recipient_phone,
        message_type, text_content, status
      ) VALUES (?, ?, ?, 'INBOUND', ?, ?, ?, ?, 'DELIVERED')
    `).run(
      uuidv4(),
      conversationId,
      wamid,
      fromPhone,
      phoneMetadata?.display_phone_number || 'DLB AUTO',
      messageType.toUpperCase(),
      textContent
    );
  }
}
