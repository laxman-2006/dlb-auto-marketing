import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { VideoClipService } from '../services/videoClipService';
import { SocialSchedulerService } from '../services/socialSchedulerService';

const router = Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads/videos');
const CLIPS_DIR = path.resolve(__dirname, '../../data/uploads/clips');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `source_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit for long gaming videos
});

// POST /api/video/clip-upload - Upload long video and start 30s 9:16 4K 60FPS slicing
router.post('/clip-upload', upload.single('video'), async (req: Request, res: Response): Promise<any> => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const jobId = uuidv4();
    const sourceName = file.originalname;
    const sourcePath = file.path;

    db.prepare(`
      INSERT INTO video_clip_jobs (id, source_name, source_path, clip_duration, aspect_ratio, quality, status)
      VALUES (?, ?, ?, 30, '9:16', '4K 60FPS', 'PENDING')
    `).run(jobId, sourceName, sourcePath);

    // Launch background slicing
    (async () => {
      await VideoClipService.processClipJob(jobId, sourcePath, CLIPS_DIR);
    })().catch((err) => {
      console.error('[VideoClip Background Error]:', err);
    });

    return res.json({
      success: true,
      jobId,
      message: `Video "${sourceName}" uploaded! Slicing into 30s 9:16 4K 60FPS reels in the background.`,
      sourceName
    });
  } catch (err: any) {
    console.error('[Video Upload Error]:', err);
    return res.status(500).json({ error: err.message || 'Video processing failed' });
  }
});

// GET /api/video/jobs - Get all clip jobs
router.get('/jobs', (_req: Request, res: Response) => {
  const jobs = VideoClipService.getJobs();
  res.json({ success: true, jobs });
});

// GET /api/video/jobs/:id - Get specific job
router.get('/jobs/:id', (req: Request, res: Response): any => {
  const job = VideoClipService.getJobById(String(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true, job });
});

// GET /api/video/stream/:clipId - Stream or download generated reel
router.get('/stream/:clipId', (req: Request, res: Response): any => {
  const clip = db.prepare('SELECT * FROM video_clips WHERE id = ?').get(String(req.params.clipId)) as any;
  if (!clip || !clip.clip_path || !fs.existsSync(clip.clip_path)) {
    return res.status(404).json({ error: 'Clip file not found' });
  }

  const stat = fs.statSync(clip.clip_path);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(clip.clip_path, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `inline; filename="${clip.clip_filename}"`
    };
    res.writeHead(200, head);
    fs.createReadStream(clip.clip_path).pipe(res);
  }
});

// POST /api/video/send-to-uploader - Assign a generated reel to a social slot
router.post('/send-to-uploader', (req: Request, res: Response): any => {
  const { clipId, platform, slotId } = req.body;
  const clip = db.prepare('SELECT * FROM video_clips WHERE id = ?').get(clipId) as any;
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  if (slotId) {
    SocialSchedulerService.updateSlot(slotId, {
      title: `DLB Viral Reel #${clip.clip_index}`,
      caption: `🔥 High Action Gaming & DLB Auto Exclusive! #reels #gaming #dlb #shorts`,
      mediaPath: clip.clip_path,
      mediaName: clip.clip_filename
    });
    return res.json({ success: true, message: `Clip #${clip.clip_index} assigned to selected ${platform} slot!` });
  }

  // Find next empty slot
  const slots = SocialSchedulerService.getSlots(platform);
  const empty = slots.find((s) => !s.media_path && s.status === 'SCHEDULED');
  if (empty) {
    SocialSchedulerService.updateSlot(empty.id, {
      title: `DLB Viral Reel #${clip.clip_index}`,
      caption: `🔥 High Action Gaming & DLB Auto Exclusive! #reels #gaming #dlb #shorts`,
      mediaPath: clip.clip_path,
      mediaName: clip.clip_filename
    });
    return res.json({ success: true, message: `Clip #${clip.clip_index} scheduled to slot "${empty.slot_label}"!` });
  }

  return res.json({ success: false, message: 'All slots for today and tomorrow are already filled.' });
});

export default router;
