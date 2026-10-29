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

  // Ultra-Safe Anti-Ban Rate Limiter State (10 to 15 messages per hour)
  private static recentWhatsAppTimestamps: number[] = [];
  private static nextAllowedWhatsAppSendTime: number = 0;
  private static isWhatsAppDispatching = false;
  private static currentDelaySec = 0;
  private static readonly MAX_MESSAGES_PER_HOUR = 15;

  /**
   * Cleans up send timestamps older than 60 minutes
   */
  private static cleanupRecentTimestamps(): void {
    const oneHourAgo = Date.now() - 3600 * 1000;
    this.recentWhatsAppTimestamps = this.recentWhatsAppTimestamps.filter((ts) => ts > oneHourAgo);
  }

  /**
   * Calculates human-like randomized delay between message sends (averaging ~4.5 minutes, i.e., ~13 msgs/hour)
   * User instructions: "ek message 5 min me, dubara 3 min me, vapas 4 min me, 5 min, 10 min, kabhi 2 min, kabhi 3 min"
   */
  private static calculateNextHumanDelay(): number {
    const choices = [
      { min: 120, max: 180, weight: 15 }, // 2 - 3 min
      { min: 180, max: 270, weight: 35 }, // 3 - 4.5 min
      { min: 270, max: 360, weight: 30 }, // 4.5 - 6 min
      { min: 360, max: 480, weight: 12 }, // 6 - 8 min
      { min: 540, max: 660, weight: 8 },  // 9 - 11 min (natural human pause)
    ];
    const rand = Math.random() * 100;
    let cum = 0;
    for (const c of choices) {
      cum += c.weight;
      if (rand <= cum) {
        return Math.floor(Math.random() * (c.max - c.min + 1)) + c.min;
      }
    }
    return 240; // Default fallback 4 minutes
  }

  /**
   * Helper to get IST greeting based on current hour in India (UTC+5:30)
   */
  public static getISTGreeting(): string {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (3600000 * 5.5));
    const hour = istDate.getHours();

    if (hour >= 4 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  }

  /**
   * Builds personalized message text with dynamic customer name & time-of-day greeting
   */
  public static personalizeMessage(rawBody: string, customerName?: string): string {
    const cleanName = (customerName || '').trim();
    const isNameValid = cleanName && 
      !['valued customer', 'customer', 'null', 'undefined', 'n/a', 'user', 'client', 'none'].includes(cleanName.toLowerCase());

    let body = (rawBody || '').trim();
    if (!body) {
      body = 'नमस्ते! DLB AUTO MARKETING में आपका स्वागत है।';
    }

    // 1. Replace explicit template placeholders: {{name}}, {name}, {{1}}, etc.
    if (isNameValid) {
      body = body.replace(/\{\{name\}\}|\{name\}/gi, cleanName);
      body = body.replace(/\{\{1\}\}/g, cleanName);
    } else {
      body = body.replace(/\{\{name\}\}|\{name\}|\{\{1\}\}/gi, 'Customer');
    }

    const greeting = this.getISTGreeting();
    const lower = body.toLowerCase();

    // Check if body already starts with a greeting
    const startsWithGreeting = 
      lower.startsWith('good morning') ||
      lower.startsWith('good afternoon') ||
      lower.startsWith('good evening') ||
      lower.startsWith('good night') ||
      lower.startsWith('नमस्ते') ||
      lower.startsWith('namaste') ||
      lower.startsWith('hello') ||
      lower.startsWith('hi ') ||
      lower.startsWith('hey ');

    if (!startsWithGreeting) {
      if (isNameValid) {
        return `${greeting} ${cleanName} जी,\n\n${body}`;
      } else {
        return `${greeting}!\n\n${body}`;
      }
    } else if (isNameValid && !body.includes(cleanName)) {
      return `${greeting} ${cleanName} जी,\n\n${body}`;
    }

    return body;
  }

  /**
   * Returns live anti-ban pacing status for UI dashboard
   */
  public static getPacingStatus() {
    this.cleanupRecentTimestamps();

    const now = Date.now();
    let nextSendInSec = 0;
    if (this.nextAllowedWhatsAppSendTime > now) {
      nextSendInSec = Math.ceil((this.nextAllowedWhatsAppSendTime - now) / 1000);
    }

    const queuedRow = db.prepare(`
      SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'QUEUED'
    `).get() as { count: number };
    const totalQueued = queuedRow?.count || 0;

    const hourlyCap = this.MAX_MESSAGES_PER_HOUR;
    const sentLastHour = this.recentWhatsAppTimestamps.length;
    
    // Average speed is ~12.5 messages/hour in 24/7 safe mode
    const estimatedHoursRemaining = totalQueued > 0 ? (totalQueued / 12.5).toFixed(1) : '0';
    const estimatedDaysRemaining = totalQueued > 0 ? (totalQueued / (12.5 * 24)).toFixed(1) : '0';

    return {
      mode: 'ANTI_BAN_SAFE',
      isDispatching: this.isWhatsAppDispatching,
      hourlyCap,
      sentLastHour,
      nextSendInSeconds: nextSendInSec,
      nextAllowedSendTime: this.nextAllowedWhatsAppSendTime ? new Date(this.nextAllowedWhatsAppSendTime).toISOString() : null,
      currentDelaySeconds: this.currentDelaySec,
      totalQueued,
      estimatedHoursRemaining,
      estimatedDaysRemaining,
      speedText: '10–15 messages/hour (Safe Anti-Ban Mode: Randomized 2m–10m intervals, 24/7 continuous)'
    };
  }

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

    // Start worker loop with throttled polling (e.g. every 500ms)
    if (this.workerInterval) clearInterval(this.workerInterval);
    this.workerInterval = setInterval(() => {
      this.processNextBatch();
    }, 500);

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
    const isBaileys = BaileysService.getStatus().connected;

    // Strict Anti-Ban Throttling for WhatsApp (Baileys)
    if (isBaileys) {
      if (this.isWhatsAppDispatching || this.activeJobs > 0) {
        return;
      }

      this.cleanupRecentTimestamps();

      // Check rolling 1-hour cap (max 15 messages/hour)
      if (this.recentWhatsAppTimestamps.length >= this.MAX_MESSAGES_PER_HOUR) {
        // Holding until oldest message falls out of 1-hour window
        return;
      }

      // Check randomized jitter delay between messages
      if (Date.now() < this.nextAllowedWhatsAppSendTime) {
        return;
      }
    } else {
      if (this.activeJobs >= config.queue.concurrency) {
        return;
      }
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
      LEFT JOIN message_templates t ON c.template_id = t.id
      LEFT JOIN whatsapp_senders s ON c.sender_id = s.id
      LEFT JOIN business_accounts b ON s.business_account_id = b.id
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
    if (!isBaileys && nextRecipient.template_status !== 'APPROVED') {
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
    if (isBaileys) {
      this.isWhatsAppDispatching = true;
    }

    // Execute message dispatch
    this.dispatchMessage(nextRecipient).finally(() => {
      this.activeJobs--;

      if (isBaileys) {
        // Record timestamp of successful or attempted send into rolling 1-hour window
        this.recentWhatsAppTimestamps.push(Date.now());

        // Calculate next randomized human delay (10-15 messages per hour)
        this.currentDelaySec = this.calculateNextHumanDelay();
        this.nextAllowedWhatsAppSendTime = Date.now() + (this.currentDelaySec * 1000);
        this.isWhatsAppDispatching = false;

        console.log(`[Queue Safe Anti-Ban] Sent message to ${nextRecipient.phone_number}. Next message in ${Math.round(this.currentDelaySec / 60)}m ${this.currentDelaySec % 60}s (${this.recentWhatsAppTimestamps.length}/${this.MAX_MESSAGES_PER_HOUR} this hour)`);
      }
    });
  }

  /**
   * Dispatches message through Meta WhatsApp Cloud API or Baileys with personalized customer name
   */
  private static async dispatchMessage(item: any) {
    try {
      const vars = item.template_parameters_json ? JSON.parse(item.template_parameters_json) : [item.customer_name || 'Customer'];

      let sendResult: { success: boolean; wamid?: string; error?: string };

      // Generate personalized body with time-of-day greeting (Good morning/afternoon/evening) and customer name
      let rawBody = item.custom_message;
      if (!rawBody || !rawBody.trim()) {
        const template = db.prepare('SELECT body_text FROM message_templates WHERE id = ?').get(item.template_id) as any;
        rawBody = template?.body_text || `Hello, this is DLB AUTO MARKETING!`;
        vars.forEach((v: string, idx: number) => {
          rawBody = rawBody.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), v);
        });
      }

      const body = this.personalizeMessage(rawBody, item.customer_name);

      if (BaileysService.getStatus().connected) {
        // Direct WhatsApp dispatch
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
          body,
          item.template_name
        );
      } else {
        // Failed
        const errorMsg = sendResult.error || 'Failed to dispatch via WhatsApp Provider';
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
