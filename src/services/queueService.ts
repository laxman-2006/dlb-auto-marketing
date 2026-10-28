import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { MetaWhatsAppService } from './metaWhatsAppService';
import { BaileysService } from './baileysService';
import { config } from '../config/env';

export class QueueService {
  private static isRunning = false;
  private static activeJobs = 0;
  private static pausedCampaigns = new Set<string>();
  private static workerInterval: NodeJS.Timeout | null = null;

  /**
   * Initializes queue worker and recovers uncompleted jobs after server restart
   */
  public static initQueueWorker() {
    console.log('[Queue] Initializing durable background message delivery queue...');

    // Recover jobs stuck in 'IN_PROGRESS' or 'QUEUED' after previous server restart
    const stuckCampaigns = db.prepare(`
      SELECT id, name FROM campaigns
      WHERE status IN ('IN_PROGRESS', 'QUEUED')
    `).all() as Array<{ id: string; name: string }>;

    for (const camp of stuckCampaigns) {
      console.log(`[Queue] Recovered active campaign: ${camp.name} (${camp.id})`);
    }

    // Reset any recipient records stuck in 'SUBMITTED' back to 'QUEUED' if no message_id was assigned
    const resetStuck = db.prepare(`
      UPDATE campaign_recipients
      SET status = 'QUEUED'
      WHERE status = 'SUBMITTED' AND message_id IS NULL
    `).run();

    if (resetStuck.changes > 0) {
      console.log(`[Queue] Reset ${resetStuck.changes} stuck unconfirmed recipients to QUEUED.`);
    }

    // Start worker loop with throttled polling (e.g. every 250ms)
    if (this.workerInterval) clearInterval(this.workerInterval);
    this.workerInterval = setInterval(() => {
      this.processNextBatch();
    }, 250);

    this.isRunning = true;
  }

  /**
   * Pauses an active campaign
   */
  public static pauseCampaign(campaignId: string) {
    this.pausedCampaigns.add(campaignId);
    db.prepare(`
      UPDATE campaigns
      SET status = 'PAUSED', paused_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(campaignId);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, 'system', 'CAMPAIGN_PAUSED', 'campaign', ?, ?)
    `).run(uuidv4(), campaignId, JSON.stringify({ reason: 'User initiated campaign pause' }));
  }

  /**
   * Resumes a paused campaign
   */
  public static resumeCampaign(campaignId: string) {
    this.pausedCampaigns.delete(campaignId);
    db.prepare(`
      UPDATE campaigns
      SET status = 'IN_PROGRESS', paused_at = NULL
      WHERE id = ?
    `).run(campaignId);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, 'system', 'CAMPAIGN_RESUMED', 'campaign', ?, ?)
    `).run(uuidv4(), campaignId, JSON.stringify({ reason: 'User initiated campaign resume' }));
  }

  /**
   * Cancels pending messages for a campaign
   */
  public static cancelCampaign(campaignId: string) {
    this.pausedCampaigns.delete(campaignId);
    
    // Cancel unsent recipients
    const cancelled = db.prepare(`
      UPDATE campaign_recipients
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE campaign_id = ? AND status IN ('QUEUED')
    `).run(campaignId);

    db.prepare(`
      UPDATE campaigns
      SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(campaignId);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, 'system', 'CAMPAIGN_CANCELLED', 'campaign', ?, ?)
    `).run(uuidv4(), campaignId, JSON.stringify({ cancelledRecipients: cancelled.changes }));

    return cancelled.changes;
  }

  /**
   * Processes the next batch of queued recipients across active campaigns
   */
  private static async processNextBatch() {
    if (this.activeJobs >= config.queue.concurrency) {
      return;
    }

    // Find the next eligible queued recipient from any active campaign
    const nextRecipient = db.prepare(`
      SELECT 
        cr.id as recipient_id,
        cr.campaign_id,
        cr.contact_id,
        cr.phone_number,
        cr.customer_name,
        cr.template_parameters_json,
        cr.idempotency_key,
        c.sender_id,
        c.template_id,
        c.name as campaign_name,
        c.custom_message,
        t.name as template_name,
        t.language as template_language,
        t.status as template_status,
        s.phone_number_id,
        b.system_user_token
      FROM campaign_recipients cr
      JOIN campaigns c ON cr.campaign_id = c.id
      JOIN message_templates t ON c.template_id = t.id
      JOIN whatsapp_senders s ON c.sender_id = s.id
      JOIN business_accounts b ON s.business_account_id = b.id
      WHERE cr.status = 'QUEUED'
        AND c.status IN ('QUEUED', 'IN_PROGRESS')
      ORDER BY cr.updated_at ASC
      LIMIT 1
    `).get() as any;

    if (!nextRecipient) {
      // Check if any in-progress campaign is now complete
      this.checkAndMarkCompletedCampaigns();
      return;
    }

    // If campaign was paused, skip
    if (this.pausedCampaigns.has(nextRecipient.campaign_id)) {
      return;
    }

    // Strict template enforcement: Template MUST be APPROVED by Meta (only if sending via Meta Cloud API)
    if (!BaileysService.getStatus().connected && nextRecipient.template_status !== 'APPROVED') {
      db.prepare(`
        UPDATE campaign_recipients
        SET status = 'FAILED', error_message = 'Template is not approved by Meta (${nextRecipient.template_status})'
        WHERE id = ?
      `).run(nextRecipient.recipient_id);

      db.prepare(`
        UPDATE campaigns
        SET failed_count = failed_count + 1
        WHERE id = ?
      `).run(nextRecipient.campaign_id);
      return;
    }

    // Strict Opt-Out / Do-Not-Contact enforcement
    const contactCheck = db.prepare(`
      SELECT do_not_contact, consent_status FROM contacts WHERE id = ?
    `).get(nextRecipient.contact_id) as { do_not_contact: number; consent_status: string } | undefined;

    if (contactCheck && (contactCheck.do_not_contact === 1 || contactCheck.consent_status === 'OPTED_OUT')) {
      db.prepare(`
        UPDATE campaign_recipients
        SET status = 'CANCELLED', error_message = 'Contact opted out or flagged as Do Not Contact'
        WHERE id = ?
      `).run(nextRecipient.recipient_id);
      return;
    }

    // Mark recipient as SUBMITTED (Atomic transition to prevent duplicate concurrent pick)
    db.prepare(`
      UPDATE campaign_recipients
      SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'QUEUED'
    `).run(nextRecipient.recipient_id);

    // Update campaign status to IN_PROGRESS if still QUEUED
    db.prepare(`
      UPDATE campaigns
      SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND status = 'QUEUED'
    `).run(nextRecipient.campaign_id);

    this.activeJobs++;

    // Execute message dispatch
    this.dispatchMessage(nextRecipient).finally(() => {
      this.activeJobs--;
    });
  }

  /**
   * Dispatches message through Meta WhatsApp Cloud API and records in send ledger
   */
  private static async dispatchMessage(item: any) {
    try {
      const vars = item.template_parameters_json ? JSON.parse(item.template_parameters_json) : [item.customer_name || 'Customer'];

      let sendResult: { success: boolean; wamid?: string; error?: string };

      if (BaileysService.getStatus().connected) {
        // Safe anti-ban randomized jitter delay (1.2s - 2.5s)
        const jitterMs = Math.floor(Math.random() * 1300) + 1200;
        await new Promise((r) => setTimeout(r, jitterMs));

        let body = item.custom_message;
        if (!body || !body.trim()) {
          const template = db.prepare('SELECT body_text FROM message_templates WHERE id = ?').get(item.template_id) as any;
          body = template?.body_text || `Hello, this is DLB AUTO MARKETING!`;
          vars.forEach((v: string, idx: number) => {
            body = body.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), v);
          });
        }
        sendResult = await BaileysService.sendMessage(item.phone_number, body);
      } else {
        sendResult = await MetaWhatsAppService.sendTemplateMessage({
          phoneNumberId: item.phone_number_id,
          systemUserToken: item.system_user_token || config.meta.systemUserToken,
          to: item.phone_number,
          templateName: item.template_name,
          languageCode: item.template_language,
          variables: vars
        });
      }

      if (sendResult.success && sendResult.wamid) {
        // Successful submission to WhatsApp Provider
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'ACCEPTED', message_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(sendResult.wamid, item.recipient_id);

        db.prepare(`
          UPDATE campaigns
          SET sent_count = sent_count + 1
          WHERE id = ?
        `).run(item.campaign_id);

        // Record in message_records ledger
        db.prepare(`
          INSERT INTO message_records (
            id, wamid, campaign_id, sender_id, recipient_phone, direction, message_type,
            content, template_name, status, pricing_category, sent_at
          ) VALUES (?, ?, ?, ?, ?, 'OUTBOUND', 'TEMPLATE', ?, ?, 'ACCEPTED', 'marketing', CURRENT_TIMESTAMP)
        `).run(
          uuidv4(),
          sendResult.wamid,
          item.campaign_id,
          item.sender_id,
          item.phone_number,
          `Template: ${item.template_name}`,
          item.template_name
        );
      } else {
        // Failed
        const errorMsg = sendResult.error || 'Failed to dispatch via WhatsApp Cloud API';
        db.prepare(`
          UPDATE campaign_recipients
          SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(errorMsg, item.recipient_id);

        db.prepare(`
          UPDATE campaigns
          SET failed_count = failed_count + 1
          WHERE id = ?
        `).run(item.campaign_id);
      }
    } catch (err: any) {
      console.error('[Queue] Error dispatching message:', err);
      db.prepare(`
        UPDATE campaign_recipients
        SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(err.message, item.recipient_id);

      db.prepare(`
        UPDATE campaigns
        SET failed_count = failed_count + 1
        WHERE id = ?
      `).run(item.campaign_id);
    }
  }

  /**
   * Inspects campaigns and transitions to COMPLETED when all recipients are processed
   */
  private static checkAndMarkCompletedCampaigns() {
    const activeCampaigns = db.prepare(`
      SELECT id FROM campaigns WHERE status = 'IN_PROGRESS'
    `).all() as Array<{ id: string }>;

    for (const camp of activeCampaigns) {
      const pendingCount = db.prepare(`
        SELECT COUNT(*) as count FROM campaign_recipients
        WHERE campaign_id = ? AND status IN ('QUEUED', 'SUBMITTED')
      `).get(camp.id) as { count: number };

      if (pendingCount.count === 0) {
        db.prepare(`
          UPDATE campaigns
          SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(camp.id);

        console.log(`[Queue] Campaign ${camp.id} completed all deliveries.`);
      }
    }
  }
}
