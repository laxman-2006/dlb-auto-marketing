import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

// GET /api/reports/overview - Aggregated metrics
router.get('/overview', (req: Request, res: Response) => {
  const totalRecipients = (db.prepare('SELECT COUNT(*) as count FROM campaign_recipients').get() as any).count;
  const queued = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'QUEUED'").get() as any).count;
  const accepted = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'ACCEPTED'").get() as any).count;
  const sent = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status IN ('SENT', 'DELIVERED', 'READ')").get() as any).count;
  const delivered = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status IN ('DELIVERED', 'READ')").get() as any).count;
  const read = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'READ'").get() as any).count;
  const failed = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'FAILED'").get() as any).count;
  const cancelled = (db.prepare("SELECT COUNT(*) as count FROM campaign_recipients WHERE status = 'CANCELLED'").get() as any).count;
  const optOuts = (db.prepare('SELECT COUNT(*) as count FROM opt_out_records').get() as any).count;

  // Authentic confirmed rates
  const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0.0';
  const readRate = delivered > 0 ? ((read / delivered) * 100).toFixed(1) : '0.0';

  // Messaging charges: Confirmed accepted/sent conversations * standard marketing rate (₹0.78)
  const estimatedChargesInr = (accepted * 0.78).toFixed(2);

  // Performance by Campaign
  const campaignBreakdown = db.prepare(`
    SELECT 
      c.id, c.name, c.created_at, c.status,
      COUNT(cr.id) as total_recipients,
      SUM(CASE WHEN cr.status IN ('SENT', 'DELIVERED', 'READ') THEN 1 ELSE 0 END) as sent_count,
      SUM(CASE WHEN cr.status IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END) as delivered_count,
      SUM(CASE WHEN cr.status = 'READ' THEN 1 ELSE 0 END) as read_count,
      SUM(CASE WHEN cr.status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
    FROM campaigns c
    LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all();

  res.json({
    metrics: {
      totalRecipients,
      queued,
      accepted,
      sent,
      delivered,
      read,
      failed,
      cancelled,
      optOuts,
      deliveryRate: `${deliveryRate}%`,
      readRate: `${readRate}%`,
      estimatedCharges: `₹${estimatedChargesInr}`
    },
    campaignBreakdown
  });
});

// GET /api/reports/export - Export delivery report as CSV
router.get('/export', (req: Request, res: Response) => {
  const records = db.prepare(`
    SELECT 
      c.name as campaign_name,
      cr.phone_number,
      cr.customer_name,
      cr.status,
      cr.message_id,
      cr.error_message,
      cr.sent_at,
      cr.delivered_at,
      cr.read_at
    FROM campaign_recipients cr
    JOIN campaigns c ON cr.campaign_id = c.id
    ORDER BY cr.updated_at DESC
    LIMIT 50000
  `).all() as any[];

  const headers = ['Campaign', 'Phone Number', 'Customer Name', 'Delivery Status', 'Meta WAMID', 'Error Details', 'Sent At', 'Delivered At', 'Read At'];
  const csvRows = [headers.join(',')];

  for (const r of records) {
    const line = [
      `"${(r.campaign_name || '').replace(/"/g, '""')}"`,
      `"${r.phone_number}"`,
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      r.status,
      `"${r.message_id || ''}"`,
      `"${(r.error_message || '').replace(/"/g, '""')}"`,
      r.sent_at || '',
      r.delivered_at || '',
      r.read_at || ''
    ];
    csvRows.push(line.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="dlb_marketing_campaign_report.csv"');
  res.send(csvRows.join('\n'));
});

export default router;
