import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  ArrowLeft,
  Upload,
  Play,
  Download,
  Send,
  Sparkles,
  RefreshCw,
  Film,
  CheckCircle2,
  Layers,
  ChevronRight
} from 'lucide-react';
import { api } from '../api';

interface ClipRecord {
  id: string;
  job_id: string;
  clip_index: number;
  start_time: number;
  duration: number;
  clip_filename: string;
  aspect_ratio: string;
  resolution: string;
  fps: number;
  file_size: number;
  created_at: string;
}

interface ClipJob {
  id: string;
  source_name: string;
  source_duration: number;
  clip_duration: number;
  aspect_ratio: string;
  quality: string;
  total_clips: number;
  completed_clips: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message?: string;
  created_at: string;
  clips?: ClipRecord[];
}

interface VideoClipStudioViewProps {
  onBackToHome: () => void;
  onOpenUploader?: () => void;
}

export const VideoClipStudioView: React.FC<VideoClipStudioViewProps> = ({
  onBackToHome,
  onOpenUploader
}) => {
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ClipJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Send to Uploader Modal
  const [clipToSend, setClipToSend] = useState<ClipRecord | null>(null);
  const [targetPlatform, setTargetPlatform] = useState<'youtube' | 'instagram' | 'facebook'>('youtube');
  const [scheduling, setScheduling] = useState(false);

  // Video Preview Modal
  const [previewClip, setPreviewClip] = useState<ClipRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await api.getVideoJobs();
      if (res?.success) {
        setJobs(res.jobs || []);
        if (res.jobs && res.jobs.length > 0) {
          // Keep current selected job or select latest
          setSelectedJob((prev) => (prev ? res.jobs.find((j: any) => j.id === prev.id) || res.jobs[0] : res.jobs[0]));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleUploadVideo = async () => {
    if (!selectedFile) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('video', selectedFile);

      const res = await api.uploadVideoForClips(fd);
      if (res.success) {
        setActionMsg(`✅ ${res.message}`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadJobs();
      }
    } catch (err: any) {
      alert(`अपलोड में समस्या: ${err.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handleSendToSocial = async () => {
    if (!clipToSend) return;
    try {
      setScheduling(true);
      const res = await api.sendClipToUploader({
        clipId: clipToSend.id,
        platform: targetPlatform
      });

      if (res.success) {
        setActionMsg(`🚀 ${res.message}`);
        setClipToSend(null);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`शेड्यूल करने में त्रुटि: ${err.message}`);
    } finally {
      setScheduling(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#0B1528', color: '#F8FAFC', overflow: 'hidden', position: 'relative' }}>
      {/* Subtle DLB Watermark */}
      <div className="main-watermark-bg" aria-hidden="true" />

      {/* Top Header */}
      <header
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(212, 166, 74, 0.2)',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBackToHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#F8FAFC',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} />
            <span>होम पेज (Home)</span>
          </button>

          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #D4A64A 0%, #A37424 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(212, 166, 74, 0.35)'
            }}
          >
            <Scissors size={22} color="#0B1528" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                Video Clip & Reel Studio (30s 9:16 4K 60FPS)
              </h1>
              <span
                style={{
                  background: 'rgba(212, 166, 74, 0.18)',
                  color: '#D4A64A',
                  border: '1px solid rgba(212, 166, 74, 0.35)',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: 20
                }}
              >
                ⚡ Ultra Gaming Resolution
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              लंबा वीडियो डालें → अपने आप 30-30 सेकंड की 9:16 वर्टिकल 4K 60FPS रील तैयार (1 घंटा = 120 रील)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onOpenUploader && (
            <button
              onClick={onOpenUploader}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #1877F2 0%, #0C5DC7 100%)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12
              }}
            >
              <span>ऑटो शेड्यूलर खोलें</span>
              <ChevronRight size={14} />
            </button>
          )}

          <button
            onClick={loadJobs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
            <span>रिफ्रेश</span>
          </button>
        </div>
      </header>

      {/* Action Notification */}
      {actionMsg && (
        <div
          style={{
            margin: '12px 28px 0',
            padding: '10px 16px',
            borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid #22c55e',
            color: '#4ade80',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Main Studio Body: 2 Columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '16px 28px 24px', gap: 20 }}>
        {/* Left Column: Upload New Video Card & Jobs History */}
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* UPLOAD CARD */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(212, 166, 74, 0.25)',
              borderRadius: 14,
              padding: 18,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={18} color="#D4A64A" />
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#D4A64A' }}>
                नया वीडियो क्लिप करें (Upload Video)
              </h2>
            </div>

            <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 14px' }}>
              अपना गेमप्ले या कोई भी वीडियो चुनें। यह अपने आप 30s 9:16 4K 60FPS में रील बना देगा।
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(212, 166, 74, 0.4)',
                borderRadius: 10,
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(212, 166, 74, 0.04)',
                transition: 'border 0.2s'
              }}
            >
              <Upload size={32} color="#D4A64A" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                {selectedFile ? selectedFile.name : 'वीडियो फाइल चुनें (Click to Browse)'}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                {selectedFile
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB selected`
                  : 'MP4, MKV, MOV, AVI (भले ही 1 घंटा या कोई भी साइज हो)'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
            </div>

            {/* Video Specs Banner */}
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.04)',
                fontSize: 11.5,
                color: '#CBD5E1',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <div>• <strong>क्लिप समय:</strong> 30 सेकंड प्रति रील (Exact 30s)</div>
              <div>• <strong>आस्पेक्ट रेशियो:</strong> 9:16 वर्टिकल (Reels, Shorts)</div>
              <div>• <strong>क्वालिटी:</strong> 4K UHD @ 60 FPS Gaming Ready</div>
            </div>

            <button
              onClick={handleUploadVideo}
              disabled={!selectedFile || uploading}
              style={{
                width: '100%',
                marginTop: 14,
                padding: '11px',
                borderRadius: 8,
                border: 'none',
                background: selectedFile && !uploading ? 'linear-gradient(135deg, #D4A64A 0%, #B88628 100%)' : '#334155',
                color: selectedFile && !uploading ? '#0B1528' : '#94A3B8',
                fontWeight: 800,
                fontSize: 13,
                cursor: selectedFile && !uploading ? 'pointer' : 'not-allowed',
                boxShadow: selectedFile && !uploading ? '0 4px 14px rgba(212, 166, 74, 0.3)' : 'none'
              }}
            >
              {uploading ? 'वीडियो प्रोसेस हो रहा है...' : '30s रील बनाना शुरू करें (Start Slicing)'}
            </button>
          </div>

          {/* PREVIOUS JOBS LIST */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#D4A64A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={15} />
              <span>सभी वीडियो प्रोजेक्ट्स (All Video Jobs)</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobs.map((j) => {
                const isSelected = selectedJob?.id === j.id;
                return (
                  <div
                    key={j.id}
                    onClick={() => setSelectedJob(j)}
                    style={{
                      background: isSelected ? 'rgba(212, 166, 74, 0.12)' : 'rgba(15, 23, 42, 0.5)',
                      border: isSelected ? '1.5px solid #D4A64A' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', wordBreak: 'break-all' }}>
                        {j.source_name}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: j.status === 'COMPLETED' ? '#14532D' : j.status === 'PROCESSING' ? '#78350F' : '#1E293B',
                          color: j.status === 'COMPLETED' ? '#4ADE80' : j.status === 'PROCESSING' ? '#FBBF24' : '#94A3B8'
                        }}
                      >
                        {j.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.completed_clips}/{j.total_clips} रील तैयार</span>
                      <span>30s • 9:16</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Generated 30s Reels Gallery */}
        <div
          style={{
            flex: 1,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {selectedJob ? (
            <>
              {/* Selected Job Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                    {selectedJob.source_name}
                  </h2>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
                    कुल लंबाई: {formatSec(selectedJob.source_duration)} • कुल रील: {selectedJob.completed_clips} / {selectedJob.total_clips} • 9:16 4K 60FPS
                  </div>
                </div>

                {selectedJob.status === 'PROCESSING' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(212, 166, 74, 0.15)', padding: '6px 12px', borderRadius: 8, color: '#D4A64A', fontSize: 12, fontWeight: 700 }}>
                    <RefreshCw size={14} className="spin-icon" />
                    <span>रील बन रही हैं ({selectedJob.completed_clips}/{selectedJob.total_clips})...</span>
                  </div>
                )}
              </div>

              {/* Clips Grid */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 16
                  }}
                >
                  {(selectedJob.clips || []).map((clip) => (
                    <div
                      key={clip.id}
                      style={{
                        background: 'rgba(11, 21, 40, 0.8)',
                        border: '1px solid rgba(212, 166, 74, 0.3)',
                        borderRadius: 12,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}
                    >
                      {/* Reel Thumbnail / 9:16 Box */}
                      <div
                        onClick={() => setPreviewClip(clip)}
                        style={{
                          width: '100%',
                          aspectRatio: '9/16',
                          background: '#070E1A',
                          borderRadius: 8,
                          position: 'relative',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: 'rgba(212, 166, 74, 0.9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0B1528',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                          }}
                        >
                          <Play size={20} fill="#0B1528" />
                        </div>
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#D4A64A'
                          }}
                        >
                          Reel #{clip.clip_index}
                        </span>
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#ffffff'
                          }}
                        >
                          {clip.duration}s
                        </span>
                      </div>

                      {/* Info & Actions */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>
                          Reel #{clip.clip_index} ({formatSec(clip.start_time)} - {formatSec(clip.start_time + clip.duration)})
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          {clip.resolution} • {clip.fps} FPS • {formatBytes(clip.file_size)}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <a
                            href={`/api/video/stream/${clip.id}`}
                            download={clip.clip_filename}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: 'rgba(255, 255, 255, 0.1)',
                              color: '#FFFFFF',
                              fontSize: 11,
                              fontWeight: 700,
                              textDecoration: 'none'
                            }}
                          >
                            <Download size={12} />
                            <span>Download</span>
                          </a>

                          <button
                            onClick={() => {
                              setClipToSend(clip);
                              setTargetPlatform('youtube');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: '#D4A64A',
                              border: 'none',
                              color: '#0B1528',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            title="सीधे ऑटो-अपलोडर में शेड्यूल करें"
                          >
                            <Send size={12} />
                            <span>Schedule</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
              <Film size={48} color="#D4A64A" style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>कोई वीडियो चयनित नहीं है</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>बाएं तरफ से वीडियो अपलोड करें या कोई प्रोजेक्ट चुनें</div>
            </div>
          )}
        </div>
      </div>

      {/* SEND TO UPLOADER MODAL */}
      {clipToSend && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 460, width: '90%', background: '#0F172A', color: '#FFFFFF', border: '1px solid #D4A64A' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#D4A64A' }}>
                Reel #{clipToSend.clip_index} को ऑटो-शेड्यूल करें
              </h2>
              <button
                onClick={() => setClipToSend(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#CBD5E1', marginBottom: 16 }}>
              यह 30s 9:16 4K रील किस सोशल मीडिया के ऑटो-अपलोड स्लॉट में शेड्यूल करनी है?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => setTargetPlatform('youtube')}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: targetPlatform === 'youtube' ? '2px solid #FF0000' : '1px solid rgba(255,255,255,0.1)',
                  background: targetPlatform === 'youtube' ? 'rgba(255,0,0,0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>YouTube Shorts (सुबह 7:15 / शाम 7:15)</span>
                {targetPlatform === 'youtube' && <CheckCircle2 size={16} color="#FF0000" />}
              </button>

              <button
                onClick={() => setTargetPlatform('instagram')}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: targetPlatform === 'instagram' ? '2px solid #E1306C' : '1px solid rgba(255,255,255,0.1)',
                  background: targetPlatform === 'instagram' ? 'rgba(225,48,108,0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>Instagram Reels (सुबह 7:15 / शाम 7:15)</span>
                {targetPlatform === 'instagram' && <CheckCircle2 size={16} color="#E1306C" />}
              </button>

              <button
                onClick={() => setTargetPlatform('facebook')}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: targetPlatform === 'facebook' ? '2px solid #1877F2' : '1px solid rgba(255,255,255,0.1)',
                  background: targetPlatform === 'facebook' ? 'rgba(24,119,242,0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>Facebook Hourly Reel (24 Daily Slots)</span>
                {targetPlatform === 'facebook' && <CheckCircle2 size={16} color="#1877F2" />}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setClipToSend(null)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
              >
                रद्द करें
              </button>
              <button
                onClick={handleSendToSocial}
                disabled={scheduling}
                style={{ padding: '8px 20px', borderRadius: 8, background: '#D4A64A', border: 'none', color: '#0B1528', fontWeight: 800, cursor: 'pointer' }}
              >
                {scheduling ? 'शेड्यूल हो रहा है...' : 'स्लॉट में असाइन करें'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9:16 VIDEO PREVIEW MODAL */}
      {previewClip && (
        <div className="modal-backdrop" onClick={() => setPreviewClip(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 340,
              aspectRatio: '9/16',
              background: '#000000',
              borderRadius: 16,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
              border: '2px solid #D4A64A'
            }}
          >
            <video
              src={`/api/video/stream/${previewClip.id}`}
              controls
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <button
              onClick={() => setPreviewClip(null)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'rgba(0,0,0,0.7)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                cursor: 'pointer',
                fontSize: 16
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
