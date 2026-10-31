import { db } from './database';

export function initSocialAndVideoSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      platform TEXT PRIMARY KEY,
      account_name TEXT,
      account_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      client_id TEXT,
      client_secret TEXT,
      status TEXT DEFAULT 'DISCONNECTED',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_schedules (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL, -- 'youtube' | 'instagram' | 'facebook'
      content_type TEXT NOT NULL, -- 'VIDEO' | 'REEL' | 'PHOTO'
      slot_label TEXT NOT NULL, -- e.g. 'Morning 07:15 AM', 'Hourly Reel 01:00 PM', 'Hourly Post 01:30 PM'
      scheduled_date TEXT, -- e.g. '2026-10-31'
      scheduled_time TEXT, -- e.g. '07:15', '12:00', '12:30'
      title TEXT,
      caption TEXT,
      media_path TEXT,
      media_name TEXT,
      status TEXT DEFAULT 'SCHEDULED', -- 'SCHEDULED' | 'PUBLISHED' | 'FAILED'
      publish_log TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS video_clip_jobs (
      id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_duration REAL DEFAULT 0,
      clip_duration INTEGER DEFAULT 30,
      aspect_ratio TEXT DEFAULT '9:16',
      quality TEXT DEFAULT '4K 60FPS',
      total_clips INTEGER DEFAULT 0,
      completed_clips INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_clips (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      clip_index INTEGER NOT NULL,
      start_time REAL NOT NULL,
      duration REAL NOT NULL,
      clip_filename TEXT NOT NULL,
      clip_path TEXT NOT NULL,
      aspect_ratio TEXT DEFAULT '9:16',
      resolution TEXT DEFAULT '3840x2160',
      fps INTEGER DEFAULT 60,
      file_size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES video_clip_jobs(id) ON DELETE CASCADE
    );
  `);

  // Safe non-destructive column migrations for YouTube video tracking
  try {
    db.exec(`ALTER TABLE social_schedules ADD COLUMN youtube_video_id TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE social_schedules ADD COLUMN youtube_video_url TEXT`);
  } catch {}

  console.log('[Database] Social Media Auto-Uploader & Video Clipper tables initialized.');
}
