import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { SocialSchedulerService } from '../services/socialSchedulerService';

const router = Router();

const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads/social');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `social_${Date.now()}_${file.originalname.replace(/[^\w.-]/g, '_')}`);
  }
});

const upload = multer({ storage });

// GET /api/social/accounts - Get connection status of YouTube, Instagram, Facebook
router.get('/accounts', (_req: Request, res: Response) => {
  const accounts = SocialSchedulerService.getAccounts();
  res.json({ success: true, accounts });
});

// POST /api/social/accounts - Save credentials
router.post('/accounts', (req: Request, res: Response) => {
  const { platform, account_name, account_id, access_token, client_id, client_secret, connected } = req.body;
  SocialSchedulerService.saveAccount(platform, {
    account_name,
    account_id,
    access_token,
    client_id,
    client_secret,
    connected: connected !== false
  });
  res.json({ success: true, message: `${platform.toUpperCase()} connection saved successfully!` });
});

// GET /api/social/slots/:platform - Get daily slots
router.get('/slots/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as 'youtube' | 'instagram' | 'facebook';
  const dateFilter = (req.query.date as string) || undefined;
  const slots = SocialSchedulerService.getSlots(platform, dateFilter);
  res.json({ success: true, platform, slots });
});

// POST /api/social/slots/:slotId/assign - Assign media and details to slot
router.post('/slots/:slotId/assign', upload.single('media'), (req: Request, res: Response): any => {
  const slotId = String(req.params.slotId);
  const file = req.file;
  const { title, caption, existingMediaPath, existingMediaName } = req.body;

  SocialSchedulerService.updateSlot(slotId, {
    title: title || '',
    caption: caption || '',
    mediaPath: file ? file.path : existingMediaPath,
    mediaName: file ? file.originalname : existingMediaName
  });

  res.json({ success: true, message: 'Slot updated and scheduled successfully!' });
});

// POST /api/social/slots/:slotId/clear - Clear slot
router.post('/slots/:slotId/clear', (req: Request, res: Response) => {
  SocialSchedulerService.clearSlot(String(req.params.slotId));
  res.json({ success: true, message: 'Slot cleared successfully.' });
});

// POST /api/social/slots/:slotId/publish-now - Force immediate dispatch
router.post('/slots/:slotId/publish-now', async (req: Request, res: Response): Promise<any> => {
  const result = await SocialSchedulerService.publishSlotNow(String(req.params.slotId));
  res.json(result);
});

export default router;
