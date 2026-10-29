import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { BaileysService } from './baileysService';

/**
 * GroupSlowAdder - Ultra-safe WhatsApp group member addition daemon.
 * Enforces strict limit of 4 to 5 members per hour (1 member added every 12 to 15 minutes)
 * to prevent WhatsApp bans and account restrictions.
 */
export class GroupSlowAdder {
  private static timer: NodeJS.Timeout | null = null;
  private static isProcessing = false;
  private static lastAddTimestamp = 0;
  private static nextScheduledTime = 0;
  private static recentAddTimestamps: number[] = [];
  private static readonly MAX_MEMBERS_PER_HOUR = 5;

  public static init() {
    console.log('[GroupSlowAdder] Initializing safe group addition background worker (4-5 members/hour)...');
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.tick();
    }, 15000); // Check every 15 seconds
  }

  private static cleanupTimestamps() {
    const oneHourAgo = Date.now() - 3600 * 1000;
    this.recentAddTimestamps = this.recentAddTimestamps.filter((t) => t > oneHourAgo);
  }

  private static getRandomIntervalMs(): number {
    // 12 to 15 minutes interval in ms (720s to 900s)
    const minSec = 720;
    const maxSec = 900;
    const sec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    return sec * 1000;
  }

  public static getStatus() {
    this.cleanupTimestamps();
    const now = Date.now();
    const nextInSec = this.nextScheduledTime > now ? Math.ceil((this.nextScheduledTime - now) / 1000) : 0;
    const pendingRow = db.prepare("SELECT COUNT(*) as c FROM group_members WHERE status = 'QUEUED'").get() as { c: number };
    
    return {
      active: true,
      pendingMembers: pendingRow?.c || 0,
      addedInLastHour: this.recentAddTimestamps.length,
      maxPerHour: this.MAX_MEMBERS_PER_HOUR,
      nextAdditionInSeconds: nextInSec,
      description: 'Ultra-Safe Anti-Ban Mode (4–5 members/hour, ~1 member every 12–15 minutes)'
    };
  }

  private static async tick() {
    if (this.isProcessing) return;

    if (!BaileysService.getStatus().connected) return;

    this.cleanupTimestamps();

    // Check hourly limit
    if (this.recentAddTimestamps.length >= this.MAX_MEMBERS_PER_HOUR) {
      return;
    }

    // Check timer delay
    const now = Date.now();
    if (this.nextScheduledTime && now < this.nextScheduledTime) {
      return;
    }

    // Find next queued member across all groups
    const nextMember = db.prepare(`
      SELECT gm.id, gm.group_id, gm.phone_number, gm.contact_name, g.group_jid, g.name as group_name, g.invite_link
      FROM group_members gm
      JOIN whatsapp_groups g ON gm.group_id = g.id
      WHERE gm.status = 'QUEUED'
      ORDER BY gm.added_at ASC
      LIMIT 1
    `).get() as any;

    if (!nextMember) return;

    this.isProcessing = true;

    try {
      const cleanPhone = nextMember.phone_number.replace(/[^\d]/g, '');
      const jid = BaileysService.formatJid(cleanPhone);

      console.log(`[GroupSlowAdder] Attempting slow safe addition of ${cleanPhone} to group ${nextMember.group_name}...`);

      const addRes = await BaileysService.addParticipantsToGroup(nextMember.group_jid, [cleanPhone]);
      const itemDetail = addRes.details && addRes.details[0];
      const st = itemDetail?.status || (addRes.added > 0 ? 'ADDED' : 'FAILED');

      if (st === 'ADDED') {
        db.prepare("UPDATE group_members SET status = 'ADDED', error_detail = NULL, added_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(nextMember.id);
        console.log(`[GroupSlowAdder] Successfully added ${cleanPhone} to ${nextMember.group_name}`);
      } else if (st === 'INVITED') {
        // Privacy setting prevents direct addition; invite link is required
        db.prepare("UPDATE group_members SET status = 'INVITED', error_detail = 'Invite link required due to privacy settings', added_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(nextMember.id);
        
        // Send invite link to user
        if (nextMember.invite_link) {
          try {
            await BaileysService.sendMessage(cleanPhone, `नमस्ते! आपको हमारे WhatsApp ग्रुप "${nextMember.group_name}" में शामिल होने का आमंत्रण दिया गया है:\n${nextMember.invite_link}`);
          } catch {}
        }
      } else if (st === 'ALREADY_MEMBER') {
        db.prepare("UPDATE group_members SET status = 'ALREADY_MEMBER', added_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(nextMember.id);
      } else {
        db.prepare("UPDATE group_members SET status = 'FAILED', error_detail = ?, added_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(itemDetail?.error || addRes.error || 'WhatsApp addition failed', nextMember.id);
      }

      // Refresh group total members
      const totalCount = (db.prepare("SELECT COUNT(*) as c FROM group_members WHERE group_id = ? AND status IN ('ADDED', 'ALREADY_MEMBER')").get(nextMember.group_id) as any)?.c || 0;
      db.prepare("UPDATE whatsapp_groups SET total_members = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(totalCount, nextMember.group_id);

      this.recentAddTimestamps.push(Date.now());
      this.lastAddTimestamp = Date.now();
      const delayMs = this.getRandomIntervalMs();
      this.nextScheduledTime = Date.now() + delayMs;
      console.log(`[GroupSlowAdder] Next member will be added in ${Math.round(delayMs / 60000)} minutes (${this.recentAddTimestamps.length}/${this.MAX_MEMBERS_PER_HOUR} this hour)`);
    } catch (err: any) {
      console.error('[GroupSlowAdder] Error adding participant:', err);
      db.prepare("UPDATE group_members SET status = 'FAILED', error_detail = ? WHERE id = ?")
        .run(err.message || 'Network error', nextMember.id);
      this.nextScheduledTime = Date.now() + 60000; // Retry next in 1 minute on error
    } finally {
      this.isProcessing = false;
    }
  }
}
