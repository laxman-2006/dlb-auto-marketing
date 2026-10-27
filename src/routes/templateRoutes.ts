import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { MetaWhatsAppService } from '../services/metaWhatsAppService';

const router = Router();

// GET /api/templates - List all templates
router.get('/', (req: Request, res: Response) => {
  const templates = db.prepare(`
    SELECT * FROM message_templates
    ORDER BY created_at DESC
  `).all();
  res.json({ templates });
});

// POST /api/templates/sync - Sync with Meta Graph API
router.post('/sync', async (req: Request, res: Response) => {
  const bAccount = db.prepare(`
    SELECT meta_waba_id, system_user_token FROM business_accounts LIMIT 1
  `).get() as any;

  if (bAccount?.meta_waba_id) {
    await MetaWhatsAppService.fetchMetaTemplates(
      bAccount.meta_waba_id,
      bAccount.system_user_token
    );
  }

  const templates = db.prepare('SELECT * FROM message_templates ORDER BY created_at DESC').all();
  res.json({ success: true, templates });
});

// POST /api/templates - Create and submit new template
router.post('/', (req: Request, res: Response): any => {
  const { name, language, category, bodyText, headerType, headerContent, footerText, buttons } = req.body;
  if (!name || !bodyText) {
    return res.status(400).json({ error: 'Template name and body text are required.' });
  }

  const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const id = uuidv4();
  const metaId = `meta_tpl_${cleanName}_${Date.now()}`;

  db.prepare(`
    INSERT INTO message_templates (
      id, meta_template_id, name, language, category, status, body_text,
      header_type, header_content, footer_text, buttons_json, variables_json
    ) VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    metaId,
    cleanName,
    language || 'en_US',
    category || 'MARKETING',
    bodyText,
    headerType || 'NONE',
    headerContent || null,
    footerText || null,
    JSON.stringify(buttons || []),
    JSON.stringify(['Customer Name'])
  );

  const created = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
  return res.status(201).json(created);
});

export default router;
