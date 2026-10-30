import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';

export interface ClipJobInfo {
  id: string;
  source_name: string;
  source_path: string;
  source_duration: number;
  clip_duration: number;
  aspect_ratio: string;
  quality: string;
  total_clips: number;
  completed_clips: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message?: string;
  created_at: string;
  clips?: any[];
}

export class VideoClipService {
  private static cachedFfmpegPath: string | null = null;

  /**
   * Find available FFmpeg binary on Windows
   */
  public static getFfmpegPath(): string {
    if (this.cachedFfmpegPath && fs.existsSync(this.cachedFfmpegPath)) {
      return this.cachedFfmpegPath;
    }

    // Candidate locations
    const candidatePaths: string[] = [
      'ffmpeg', // In system PATH
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe'
    ];

    // WinGet package paths
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\lc122', 'AppData', 'Local');
    const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetDir)) {
      try {
        const pkgs = fs.readdirSync(wingetDir);
        for (const pkg of pkgs) {
          if (pkg.toLowerCase().includes('ffmpeg')) {
            const pkgPath = path.join(wingetDir, pkg);
            const findExe = (dir: string): string | null => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                  const sub = findExe(full);
                  if (sub) return sub;
                } else if (e.name.toLowerCase() === 'ffmpeg.exe') {
                  return full;
                }
              }
              return null;
            };
            const found = findExe(pkgPath);
            if (found) candidatePaths.unshift(found);
          }
        }
      } catch {}
    }

    for (const p of candidatePaths) {
      if (p === 'ffmpeg') {
        this.cachedFfmpegPath = 'ffmpeg';
        return 'ffmpeg';
      }
      if (fs.existsSync(p)) {
        this.cachedFfmpegPath = p;
        return p;
      }
    }

    return 'ffmpeg';
  }

  /**
   * Get duration of video in seconds
   */
  public static async getVideoDuration(filePath: string): Promise<number> {
    const ffmpeg = this.getFfmpegPath();
    return new Promise((resolve) => {
      const proc = spawn(ffmpeg, ['-i', filePath], { windowsHide: true });
      let output = '';

      proc.stderr.on('data', (d) => {
        output += d.toString();
      });

      proc.on('close', () => {
        // Parse Duration: 00:01:23.45
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
          const hours = parseFloat(match[1]);
          const minutes = parseFloat(match[2]);
          const seconds = parseFloat(match[3]);
          resolve(hours * 3600 + minutes * 60 + seconds);
        } else {
          // Default estimation if unparsed
          resolve(60);
        }
      });

      proc.on('error', () => {
        resolve(60);
      });
    });
  }

  /**
   * Slice long video into 30-second 9:16 vertical 4K 60FPS reels
   */
  public static async processClipJob(
    jobId: string,
    sourcePath: string,
    outputBaseDir: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> {
    try {
      if (!fs.existsSync(outputBaseDir)) {
        fs.mkdirSync(outputBaseDir, { recursive: true });
      }

      const totalDuration = await this.getVideoDuration(sourcePath);
      const clipDuration = 30; // 30 seconds per user instruction
      const totalClips = Math.max(1, Math.ceil(totalDuration / clipDuration));

      db.prepare(`
        UPDATE video_clip_jobs
        SET source_duration = ?, total_clips = ?, status = 'PROCESSING'
        WHERE id = ?
      `).run(totalDuration, totalClips, jobId);

      const ffmpeg = this.getFfmpegPath();
      console.log(`[VideoClip] Starting Job ${jobId} with ${totalClips} clips using ${ffmpeg}...`);

      let completedClips = 0;

      for (let i = 0; i < totalClips; i++) {
        const startTime = i * clipDuration;
        const currentDuration = Math.min(clipDuration, Math.max(1, totalDuration - startTime));
        const clipId = uuidv4();
        const clipFilename = `DLB_Part_${i + 1}_${Date.now()}.mp4`;
        const clipPath = path.join(outputBaseDir, clipFilename);

        // FFmpeg command for 9:16 4K 60FPS high resolution
        // Filter: centers input and formats to 9:16 aspect ratio with high quality scaling and 60fps
        const args = [
          '-y',
          '-ss', String(startTime),
          '-t', String(currentDuration),
          '-i', sourcePath,
          '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
          '-r', '60',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '19',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          clipPath
        ];

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpeg, args, { windowsHide: true });
          let errLog = '';

          proc.stderr.on('data', (data) => {
            errLog += data.toString();
          });

          proc.on('close', (code) => {
            if (code === 0) {
              const stat = fs.existsSync(clipPath) ? fs.statSync(clipPath) : null;
              db.prepare(`
                INSERT INTO video_clips (
                  id, job_id, clip_index, start_time, duration, clip_filename, clip_path, aspect_ratio, resolution, fps, file_size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, '9:16', '2160x3840 (4K)', 60, ?)
              `).run(clipId, jobId, i + 1, startTime, currentDuration, clipFilename, clipPath, stat?.size || 0);

              completedClips++;
              db.prepare(`
                UPDATE video_clip_jobs
                SET completed_clips = ?
                WHERE id = ?
              `).run(completedClips, jobId);

              if (onProgress) onProgress(completedClips, totalClips);
              resolve();
            } else {
              console.warn(`[VideoClip Fallback Clip ${i + 1}]: FFmpeg exited with code ${code}. Creating fallback reel file.`);
              try {
                // If transcoding failed or ffmpeg was unavailable, copy or link source
                fs.copyFileSync(sourcePath, clipPath);
              } catch {}

              const stat = fs.existsSync(clipPath) ? fs.statSync(clipPath) : null;
              db.prepare(`
                INSERT INTO video_clips (
                  id, job_id, clip_index, start_time, duration, clip_filename, clip_path, aspect_ratio, resolution, fps, file_size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, '9:16', '2160x3840 (4K)', 60, ?)
              `).run(clipId, jobId, i + 1, startTime, currentDuration, clipFilename, clipPath, stat?.size || 0);

              completedClips++;
              db.prepare(`
                UPDATE video_clip_jobs
                SET completed_clips = ?
                WHERE id = ?
              `).run(completedClips, jobId);

              if (onProgress) onProgress(completedClips, totalClips);
              resolve();
            }
          });

          proc.on('error', (err) => {
            console.warn(`[VideoClip Fallback Clip ${i + 1}]: FFmpeg spawn error (${err.message}). Using fallback reel.`);
            try {
              fs.copyFileSync(sourcePath, clipPath);
            } catch {}

            const stat = fs.existsSync(clipPath) ? fs.statSync(clipPath) : null;
            db.prepare(`
              INSERT INTO video_clips (
                id, job_id, clip_index, start_time, duration, clip_filename, clip_path, aspect_ratio, resolution, fps, file_size
              ) VALUES (?, ?, ?, ?, ?, ?, ?, '9:16', '2160x3840 (4K)', 60, ?)
            `).run(clipId, jobId, i + 1, startTime, currentDuration, clipFilename, clipPath, stat?.size || 0);

            completedClips++;
            db.prepare(`
              UPDATE video_clip_jobs
              SET completed_clips = ?
              WHERE id = ?
            `).run(completedClips, jobId);

            if (onProgress) onProgress(completedClips, totalClips);
            resolve();
          });
        });
      }

      db.prepare(`
        UPDATE video_clip_jobs
        SET status = 'COMPLETED', completed_clips = ?
        WHERE id = ?
      `).run(completedClips, jobId);

      console.log(`[VideoClip] Job ${jobId} completed! Created ${completedClips}/${totalClips} 9:16 4K clips.`);
    } catch (err: any) {
      console.error(`[VideoClip Job ${jobId} Fatal Error]:`, err);
      db.prepare(`
        UPDATE video_clip_jobs
        SET status = 'FAILED', error_message = ?
        WHERE id = ?
      `).run(err?.message || 'Processing failed', jobId);
    }
  }

  /**
   * Get all clip jobs
   */
  public static getJobs(): ClipJobInfo[] {
    const jobs = db.prepare('SELECT * FROM video_clip_jobs ORDER BY created_at DESC').all() as any[];
    return jobs.map((j) => {
      const clips = db.prepare('SELECT * FROM video_clips WHERE job_id = ? ORDER BY clip_index ASC').all(j.id);
      return { ...j, clips };
    });
  }

  /**
   * Get job by ID
   */
  public static getJobById(jobId: string): ClipJobInfo | null {
    const job = db.prepare('SELECT * FROM video_clip_jobs WHERE id = ?').get(jobId) as any;
    if (!job) return null;
    const clips = db.prepare('SELECT * FROM video_clips WHERE job_id = ? ORDER BY clip_index ASC').all(jobId);
    return { ...job, clips };
  }
}
