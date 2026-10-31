import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ArrowLeft,
  Upload,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Send,
  Settings,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { YoutubeIcon, InstagramIcon, FacebookIcon } from './SocialIcons';
import { api } from '../api';

interface SlotItem {
  id: string;
  platform: 'youtube' | 'instagram' | 'facebook';
  content_type: 'VIDEO' | 'REEL' | 'PHOTO';
  slot_label: string;
  scheduled_date: string;
  scheduled_time: string;
  title: string;
  caption: string;
  media_path?: string;
  media_name?: string;
  status: 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
  publish_log?: string;
  published_at?: string;
}

interface AutoVideoUploaderViewProps {
  onBackToHome: () => void;
  onNavigateSettings: () => void;
}

export const AutoVideoUploaderView: React.FC<AutoVideoUploaderViewProps> = ({
  onBackToHome,
  onNavigateSettings
}) => {
  const [activePlatform, setActivePlatform] = useState<'youtube' | 'instagram' | 'facebook'>('youtube');
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [accounts, setAccounts] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Edit / Assign Modal
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalCaption, setModalCaption] = useState('');
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);

  // Date Filter & Bulk Actions
  const [selectedDate, setSelectedDate] = useState<string>('TODAY');
  const [autoDistributing, setAutoDistributing] = useState(false);
  const [bulkUploadingPosters, setBulkUploadingPosters] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const bulkPosterInputRef = useRef<HTMLInputElement>(null);

  // Filter tabs for Facebook: ALL | REELS (24) | POSTS (24)
  const [fbFilter, setFbFilter] = useState<'ALL' | 'REEL' | 'PHOTO'>('ALL');

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  const loadAccounts = async () => {
    try {
      const res = await api.getSocialAccounts();
      if (res?.success) setAccounts(res.accounts || {});
    } catch (err) {
      console.error(err);
    }
  };

  const loadSlots = async () => {
    try {
      setLoading(true);
      const res = await api.getSocialSlots(activePlatform);
      if (res?.success) setSlots(res.slots || []);
    } catch (err) {
      console.error('Failed to load slots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadSlots();
  }, [activePlatform]);

  const handleOpenAssign = (slot: SlotItem) => {
    setSelectedSlot(slot);
    setModalTitle(slot.title || '');
    setModalCaption(slot.caption || '');
    setModalFile(null);
  };

  const handleSaveSlot = async () => {
    if (!selectedSlot) return;
    try {
      setSavingSlot(true);
      const fd = new FormData();
      fd.append('title', modalTitle);
      fd.append('caption', modalCaption);
      if (modalFile) {
        fd.append('media', modalFile);
      } else if (selectedSlot.media_path) {
        fd.append('existingMediaPath', selectedSlot.media_path);
        fd.append('existingMediaName', selectedSlot.media_name || '');
      }

      await api.assignSocialSlot(selectedSlot.id, fd);
      setActionMsg(`✅ स्लाट "${selectedSlot.slot_label}" सफलतापूर्वक शेड्यूल हो गया है!`);
      setSelectedSlot(null);
      await loadSlots();
    } catch (err: any) {
      alert(`स्लॉट सेव करने में त्रुटि: ${err.message}`);
    } finally {
      setSavingSlot(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const handleClearSlot = async (slotId: string) => {
    if (!window.confirm('क्या आप इस स्लॉट से वीडियो / डेटा हटाना चाहते हैं?')) return;
    try {
      await api.clearSocialSlot(slotId);
      setActionMsg('🗑️ स्लॉट खाली कर दिया गया।');
      await loadSlots();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePublishNow = async (slotId: string) => {
    try {
      const res = await api.publishSocialSlotNow(slotId);
      if (res.success) {
        setActionMsg(`🚀 ${res.message}`);
        await loadSlots();
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`पब्लिश करने में समस्या: ${err.message}`);
    }
  };

  const handleAutoDistributeFromStudio = async () => {
    try {
      setAutoDistributing(true);
      const jobsRes = await api.getVideoJobs();
      if (!jobsRes?.success || !jobsRes.jobs || jobsRes.jobs.length === 0) {
        alert('क्लिप स्टूडियो में कोई प्रोसेस किया गया वीडियो नहीं मिला। पहले वीडियो क्लिप स्टूडियो में वीडियो डालें।');
        return;
      }

      const jobWithClips = jobsRes.jobs.find((j: any) => j.completed_clips > 0) || jobsRes.jobs[0];
      if (!jobWithClips || jobWithClips.completed_clips === 0) {
        alert('क्लिप स्टूडियो में अभी रील तैयार हो रही हैं। कृपया थोड़ा इंतजार करें।');
        return;
      }

      const res = await api.autoDistributeVideoClips({
        jobId: jobWithClips.id,
        platforms: ['youtube', 'instagram', 'facebook']
      });

      if (res?.success) {
        setActionMsg(`🚀 ${res.message}`);
        await loadSlots();
      } else {
        alert(res?.message || 'ऑटो-शेड्यूलिंग विफल रही');
      }
    } catch (err: any) {
      alert(`त्रुटि: ${err.message}`);
    } finally {
      setAutoDistributing(false);
      setTimeout(() => setActionMsg(null), 7000);
    }
  };

  const handleBulkUploadPosters = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setBulkUploadingPosters(true);
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append('posters', files[i]);
      }
      const targetDate = selectedDate === 'TODAY' || selectedDate === 'ALL' ? todayStr : selectedDate === 'TOMORROW' ? tomorrowStr : selectedDate;
      fd.append('date', targetDate);

      const res = await api.bulkUploadFacebookPosters(fd);
      if (res?.success) {
        setActionMsg(`✅ ${res.message}`);
        await loadSlots();
      } else {
        alert(res?.error || 'पोस्टर अपलोड विफल रहा');
      }
    } catch (err: any) {
      alert(`अपलोड में त्रुटि: ${err.message}`);
    } finally {
      setBulkUploadingPosters(false);
      setTimeout(() => setActionMsg(null), 6000);
    }
  };

  const handleSyncRollover = async () => {
    try {
      setSyncing(true);
      const res = await api.syncAndRolloverSlots(activePlatform);
      if (res?.success) {
        setActionMsg(`✅ ${res.message}`);
        await loadSlots();
      }
    } catch (err: any) {
      alert(`सिंक त्रुटि: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const currentAccount = accounts[activePlatform];
  const isConnected = currentAccount?.connected === true;

  const activeDate = selectedDate === 'TODAY' ? todayStr : selectedDate === 'TOMORROW' ? tomorrowStr : selectedDate;

  // Filtered slots for active platform & date
  const displayedSlots = slots.filter((s) => {
    if (activePlatform === 'facebook') {
      if (fbFilter !== 'ALL' && s.content_type !== fbFilter) return false;
    }
    if (selectedDate !== 'ALL') {
      return s.scheduled_date === activeDate;
    }
    return true;
  });

  // Calculate target metrics for current view
  const now = new Date();
  // Identify the first upcoming slot that has a queued reel
  const firstUpcomingSlot = slots.find((s) => {
    const slotDateTime = new Date(`${s.scheduled_date}T${s.scheduled_time}:00`);
    return slotDateTime.getTime() > now.getTime() && Boolean(s.media_path) && s.status === 'SCHEDULED';
  });

  let uploadedCount = 0;
  let missedCount = 0;
  let scheduledCount = 0;
  let emptyCount = 0;

  for (const s of displayedSlots) {
    const slotDateTime = new Date(`${s.scheduled_date}T${s.scheduled_time}:00`);
    const isPast = slotDateTime.getTime() <= now.getTime();
    const hasMedia = Boolean(s.media_path);

    if (s.status === 'PUBLISHED') {
      uploadedCount++;
    } else if (isPast) {
      missedCount++;
    } else if (hasMedia) {
      scheduledCount++;
    } else {
      emptyCount++;
    }
  }

  return (
    <div className="bizz-app" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Subtle DLB Watermark */}
      <div className="main-watermark-bg" aria-hidden="true" />

      {/* LEFT NARROW RAIL */}
      <nav className="left-rail">
        <div className="rail-top">
          {/* Back to Home Button */}
          <button
            className="rail-btn"
            onClick={onBackToHome}
            title="होम पेज पर वापस जाएं (Back to Home)"
            style={{ color: '#D4A64A', marginBottom: 12 }}
          >
            <ArrowLeft size={22} />
          </button>

          {/* YouTube Platform Tab */}
          <button
            className={`rail-btn ${activePlatform === 'youtube' ? 'active' : ''}`}
            onClick={() => setActivePlatform('youtube')}
            title="YouTube Video Automation (सुबह 7:15 & शाम 7:15)"
            style={{ color: activePlatform === 'youtube' ? '#FF0000' : undefined }}
          >
            <YoutubeIcon size={22} color={activePlatform === 'youtube' ? '#FF0000' : '#94A3B8'} />
          </button>

          {/* Instagram Platform Tab */}
          <button
            className={`rail-btn ${activePlatform === 'instagram' ? 'active' : ''}`}
            onClick={() => setActivePlatform('instagram')}
            title="Instagram Reel Automation (सुबह 7:15 & शाम 7:15)"
            style={{ color: activePlatform === 'instagram' ? '#E1306C' : undefined }}
          >
            <InstagramIcon size={22} color={activePlatform === 'instagram' ? '#E1306C' : '#94A3B8'} />
          </button>

          {/* Facebook Platform Tab */}
          <button
            className={`rail-btn ${activePlatform === 'facebook' ? 'active' : ''}`}
            onClick={() => setActivePlatform('facebook')}
            title="Facebook 48 Daily Slots (हर घंटे रील व पोस्ट)"
            style={{ color: activePlatform === 'facebook' ? '#1877F2' : undefined }}
          >
            <FacebookIcon size={22} color={activePlatform === 'facebook' ? '#1877F2' : '#94A3B8'} />
          </button>
        </div>

        <div className="rail-bottom">
          <button
            className="rail-btn"
            onClick={onNavigateSettings}
            title="Settings में लॉगिन करें"
          >
            <Settings size={22} />
          </button>
        </div>
      </nav>

      {/* MAIN UPLOADER WORKSPACE */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        {/* Top Header */}
        <header
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #E2E8F0',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#334155',
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
                width: 40,
                height: 40,
                borderRadius: 10,
                background:
                  activePlatform === 'youtube'
                    ? 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)'
                    : activePlatform === 'instagram'
                    ? 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)'
                    : 'linear-gradient(135deg, #1877F2 0%, #0C5DC7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
              }}
            >
              {activePlatform === 'youtube' && <YoutubeIcon size={22} color="#ffffff" />}
              {activePlatform === 'instagram' && <InstagramIcon size={22} color="#ffffff" />}
              {activePlatform === 'facebook' && <FacebookIcon size={22} color="#ffffff" />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {activePlatform === 'youtube' && 'YouTube Automatic Video Uploader (यूट्यूब)'}
                  {activePlatform === 'instagram' && 'Instagram Automatic Reel Uploader (इंस्टाग्राम)'}
                  {activePlatform === 'facebook' && 'Facebook 48 Daily Slots (फेसबुक 24 रील + 24 पोस्ट)'}
                </h1>
                <span
                  onClick={!isConnected ? onNavigateSettings : undefined}
                  style={{
                    background: isConnected ? '#DCFCE7' : '#FEE2E2',
                    color: isConnected ? '#15803D' : '#B91C1C',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: 20,
                    cursor: !isConnected ? 'pointer' : 'default',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title={!isConnected ? 'सेटिंग्स में जाकर कनेक्ट करें' : undefined}
                >
                  {isConnected ? '● Connected' : '○ Login Required (सेटिंग्स में जाएं)'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                {activePlatform === 'youtube' && 'पर डे 2 वीडियो: सुबह 07:15 AM और शाम 07:15 PM पर ऑटोमैटिक अपलोड'}
                {activePlatform === 'instagram' && 'पर डे 2 रील: सुबह 07:15 AM और शाम 07:15 PM पर ऑटोमैटिक पब्लिश'}
                {activePlatform === 'facebook' && 'डेली 48 स्लॉट्स: हर घंटे रील (:00) और हर घंटे फोटो/पोस्टर (:30) ऑटो-अपलोड'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Auto-distribute from studio button */}
            <button
              onClick={handleAutoDistributeFromStudio}
              disabled={autoDistributing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.35)'
              }}
              title="क्लिप स्टूडियो के वीडियो को Part 1, Part 2... के अनुसार सभी स्लॉट्स में ऑटो-फ़िल करें"
            >
              <Send size={14} />
              <span>{autoDistributing ? 'ऑटो-फ़िल हो रहा है...' : '⚡ क्लिप स्टूडियो से ऑटो-फ़िल करें'}</span>
            </button>

            {/* Bulk Poster Upload for Facebook */}
            {activePlatform === 'facebook' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#0D9488',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.3)'
                }}
                title="Facebook के 24 hourly फोटो स्लॉट्स (:30) में एक साथ फोटो/पोस्टर अपलोड करें"
              >
                <Upload size={14} />
                <span>{bulkUploadingPosters ? 'अपलोड हो रहा है...' : '🖼️ 24 पोस्टर्स बल्क अपलोड करें'}</span>
                <input
                  ref={bulkPosterInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleBulkUploadPosters}
                  disabled={bulkUploadingPosters}
                />
              </label>
            )}

            <button
              onClick={handleSyncRollover}
              disabled={syncing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'rgba(212, 166, 74, 0.12)',
                border: '1px solid #D4A64A',
                color: '#926014',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12
              }}
              title="छूटे हुए स्लॉट्स को सिंक करें ताकि Part 1 आगामी स्लॉट में सबसे आगे सुरक्षित रहे"
            >
              <RefreshCw size={14} className={syncing ? 'spin-icon' : ''} />
              <span>{syncing ? 'सिंक हो रहा है...' : '🔄 कतार सिंक करें (Rollover)'}</span>
            </button>

            <button
              onClick={loadSlots}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: '#ffffff',
                border: '1px solid #E2E8F0',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              <span>रिफ्रेश</span>
            </button>
            <button
              onClick={onNavigateSettings}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                background: '#0F172A',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12
              }}
            >
              <Settings size={14} />
              <span>अकाउंट सेटिंग्स</span>
            </button>
          </div>
        </header>

        {/* Account Disconnected Safe-Queue Banner */}
        {!isConnected && (
          <div
            style={{
              margin: '12px 28px 0',
              padding: '11px 16px',
              borderRadius: 8,
              background: '#FFFBEB',
              border: '1px solid #FCD34D',
              color: '#92400E',
              fontSize: 12.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} color="#D97706" />
              <span>
                <strong>{activePlatform.toUpperCase()} अभी कनेक्ट नहीं है:</strong> जब तक आप सेटिंग्स से अकाउंट कनेक्ट नहीं करते, कोई भी रील मिस या स्किप नहीं होगी — <strong style={{ color: '#B45309' }}>Part 1 हमेशा अगले स्लॉट में सुरक्षित रहेगा</strong> और अकाउंट कनेक्ट होते ही सबसे पहले अपलोड होगा!
              </span>
            </div>
            <button
              onClick={onNavigateSettings}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                background: '#D97706',
                border: 'none',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: 'pointer'
              }}
            >
              खाता कनेक्ट करें →
            </button>
          </div>
        )}

        {/* Action / Notification Banner */}
        {actionMsg && (
          <div
            style={{
              margin: '12px 28px 0',
              padding: '10px 16px',
              borderRadius: 8,
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <CheckCircle2 size={16} />
            <span>{actionMsg}</span>
          </div>
        )}

        {/* Date Selector & Target Status Bar */}
        <div style={{ padding: '12px 28px 0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Date Selector Pills */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={13} />
              तारीख (Date):
            </span>
            <button
              onClick={() => setSelectedDate('TODAY')}
              style={{
                padding: '5px 12px',
                borderRadius: 14,
                border: selectedDate === 'TODAY' ? '1px solid #0F172A' : '1px solid #CBD5E1',
                background: selectedDate === 'TODAY' ? '#0F172A' : '#ffffff',
                color: selectedDate === 'TODAY' ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: 'pointer'
              }}
            >
              आज ({todayStr})
            </button>
            <button
              onClick={() => setSelectedDate('TOMORROW')}
              style={{
                padding: '5px 12px',
                borderRadius: 14,
                border: selectedDate === 'TOMORROW' ? '1px solid #0F172A' : '1px solid #CBD5E1',
                background: selectedDate === 'TOMORROW' ? '#0F172A' : '#ffffff',
                color: selectedDate === 'TOMORROW' ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: 'pointer'
              }}
            >
              कल ({tomorrowStr})
            </button>
            <button
              onClick={() => setSelectedDate('ALL')}
              style={{
                padding: '5px 12px',
                borderRadius: 14,
                border: selectedDate === 'ALL' ? '1px solid #0F172A' : '1px solid #CBD5E1',
                background: selectedDate === 'ALL' ? '#0F172A' : '#ffffff',
                color: selectedDate === 'ALL' ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: 'pointer'
              }}
            >
              सभी तारीखें (All Dates)
            </button>
          </div>

          {/* Target Ledger Metrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}>
            <span style={{ fontWeight: 800, color: '#0F172A' }}>
              🎯 डेली स्टेटस ({activePlatform === 'facebook' ? '48 स्लॉट्स' : '2 स्लॉट्स'}):
            </span>
            <span style={{ fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: 6 }}>
              ✅ अपलोड हो गया: {uploadedCount}
            </span>
            <span style={{ fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: 6 }}>
              ❌ अपलोड नहीं हुआ: {missedCount}
            </span>
            <span style={{ fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: 6 }}>
              ⏳ शेड्यूल है: {scheduledCount}
            </span>
            <span style={{ fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 6 }}>
              ⚠️ खाली: {emptyCount}
            </span>
          </div>
        </div>

        {/* Facebook Filter Pills */}
        {activePlatform === 'facebook' && (
          <div style={{ padding: '10px 28px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>कंटेंट टाइप:</span>
            <button
              onClick={() => setFbFilter('ALL')}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: 'none',
                background: fbFilter === 'ALL' ? '#1877F2' : '#E2E8F0',
                color: fbFilter === 'ALL' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              सभी (48 स्लॉट्स)
            </button>
            <button
              onClick={() => setFbFilter('REEL')}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: 'none',
                background: fbFilter === 'REEL' ? '#833AB4' : '#E2E8F0',
                color: fbFilter === 'REEL' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              🎥 हर घंटे रील (:00 - 24 Reels)
            </button>
            <button
              onClick={() => setFbFilter('PHOTO')}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: 'none',
                background: fbFilter === 'PHOTO' ? '#0D9488' : '#E2E8F0',
                color: fbFilter === 'PHOTO' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              🖼️ हर घंटे पोस्टर/फोटो (:30 - 24 Posts)
            </button>
          </div>
        )}

        {/* Slots Grid Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 40px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}
          >
            {displayedSlots.map((slot) => {
              const hasMedia = Boolean(slot.media_path);
              const isPublished = slot.status === 'PUBLISHED';
              const slotDateTime = new Date(`${slot.scheduled_date}T${slot.scheduled_time}:00`);
              const isPast = slotDateTime.getTime() <= now.getTime();

              const borderStyle = isPublished
                ? '2px solid #22c55e'
                : isPast
                ? '2px solid #ef4444'
                : hasMedia
                ? '1.5px solid #3b82f6'
                : '1px dashed #CBD5E1';

              return (
                <div
                  key={slot.id}
                  style={{
                    background: '#ffffff',
                    border: borderStyle,
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s, box-shadow 0.15s'
                  }}
                >
                  <div>
                    {/* Slot Header Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: slot.content_type === 'REEL' ? '#FDF2F8' : slot.content_type === 'VIDEO' ? '#FEF2F2' : '#F0FDFA',
                          color: slot.content_type === 'REEL' ? '#DB2777' : slot.content_type === 'VIDEO' ? '#DC2626' : '#0D9488'
                        }}
                      >
                        {slot.content_type === 'REEL' ? '🎬 REEL' : slot.content_type === 'VIDEO' ? '▶️ VIDEO' : '🖼️ PHOTO POST'}
                      </span>

                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0F172A',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Clock size={13} color="#D4A64A" />
                        {slot.scheduled_time} ({slot.scheduled_date})
                      </span>
                    </div>

                    {slot.id === firstUpcomingSlot?.id && (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                          border: '1px solid #F59E0B',
                          borderRadius: 6,
                          padding: '3px 8px',
                          marginBottom: 8,
                          fontSize: 11,
                          fontWeight: 800,
                          color: '#92400E',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <span>🌟 अगला अपलोड (Next in Line: Part 1)</span>
                      </div>
                    )}

                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1E293B', marginBottom: 6 }}>
                      {slot.slot_label}
                    </div>

                    {/* STATUS LEDGER BANNER */}
                    {isPublished ? (
                      <div
                        style={{
                          background: '#DCFCE7',
                          border: '1px solid #86EFAC',
                          borderRadius: 8,
                          padding: '8px 10px',
                          marginTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: '#15803D'
                        }}
                      >
                        <CheckCircle2 size={16} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>✅ अपलोड हो गया (Uploaded Successfully)</div>
                          <div style={{ fontSize: 11, color: '#166534', marginTop: 1 }}>
                            पब्लिश समय: {slot.published_at ? new Date(slot.published_at).toLocaleTimeString() : slot.scheduled_time}
                          </div>
                        </div>
                      </div>
                    ) : isPast ? (
                      <div
                        style={{
                          background: '#FEE2E2',
                          border: '1px solid #FCA5A5',
                          borderRadius: 8,
                          padding: '8px 10px',
                          marginTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: '#B91C1C'
                        }}
                      >
                        <AlertCircle size={16} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>❌ अपलोड नहीं हुआ (समय बीत चुका है)</div>
                          <div style={{ fontSize: 10.5, color: '#991B1B', marginTop: 1 }}>
                            समय ({slot.scheduled_time}) मिस हो गया और वीडियो अपलोड नहीं हुआ।
                          </div>
                        </div>
                      </div>
                    ) : hasMedia ? (
                      <div
                        style={{
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: 8,
                          padding: '8px 10px',
                          marginTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: '#1D4ED8'
                        }}
                      >
                        <Clock size={16} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>⏳ शेड्यूल है (तय समय पर ऑटो-अपलोड होगा)</div>
                          <div style={{ fontSize: 11, color: '#1E40AF', marginTop: 1 }}>
                            फाइल: {slot.media_name || 'Attached Media'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1.5px dashed #CBD5E1',
                          borderRadius: 8,
                          padding: '10px 10px',
                          marginTop: 8,
                          textAlign: 'center',
                          color: '#64748B'
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>⚠️ स्लॉट खाली (वीडियो की प्रतीक्षा)</div>
                        <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>
                          क्लिप स्टूडियो से ऑटो-फ़िल करें या सीधे वीडियो जोड़ें
                        </div>
                      </div>
                    )}

                    {/* Media / Video Info */}
                    {hasMedia && (
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: 8,
                          padding: '8px 10px',
                          marginTop: 8
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} color="#16a34a" />
                          <span style={{ wordBreak: 'break-all' }}>{slot.media_name || 'Attached Video/Media'}</span>
                        </div>
                        {slot.title && (
                          <div style={{ fontSize: 11.5, color: '#334155', marginTop: 4, fontWeight: 700 }}>
                            शीर्षक: {slot.title}
                          </div>
                        )}
                        {slot.caption && (
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, maxHeight: 36, overflow: 'hidden' }}>
                            {slot.caption}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Slot Footer Actions */}
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleOpenAssign(slot)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: '#0F172A',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Upload size={13} />
                        <span>{hasMedia ? 'बदलें (Edit)' : 'वीडियो जोड़ें (Add)'}</span>
                      </button>

                      {hasMedia && (
                        <button
                          onClick={() => handleClearSlot(slot.id)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            background: '#FEE2E2',
                            border: 'none',
                            color: '#991B1B',
                            cursor: 'pointer'
                          }}
                          title="हटाएं"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {hasMedia && (
                      <button
                        onClick={() => handlePublishNow(slot.id)}
                        disabled={isPublished}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: isPublished ? '#DCFCE7' : '#D4A64A',
                          border: 'none',
                          color: isPublished ? '#15803D' : '#0B1528',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: isPublished ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        {isPublished ? <CheckCircle2 size={13} /> : <Send size={13} />}
                        <span>{isPublished ? 'पब्लिश हो गया' : 'अभी अपलोड करें'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ASSIGN / UPLOAD MODAL */}
      {selectedSlot && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 520, width: '90%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  स्लॉट में वीडियो / पोस्ट जोड़ें
                </h2>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {selectedSlot.slot_label} ({selectedSlot.scheduled_time})
                </div>
              </div>
              <button
                onClick={() => setSelectedSlot(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* File input */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  वीडियो या फोटो चुनें (Select Video/Image):
                </label>
                <input
                  type="file"
                  accept="video/*,image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setModalFile(e.target.files[0]);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1.5px dashed #CBD5E1',
                    borderRadius: 8,
                    background: '#F8FAFC',
                    fontSize: 13
                  }}
                />
                {modalFile && (
                  <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginTop: 4 }}>
                    चयनित फाइल: {modalFile.name} ({(modalFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                )}
              </div>

              {/* Title input */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  शीर्षक (Title):
                </label>
                <input
                  type="text"
                  placeholder="e.g. DLB Auto Special Offer / Viral Gaming Highlights"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Caption / Description input */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  कैप्शन व हैशटैग (Caption & Hashtags):
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Exciting updates from DLB Auto! Visit us today. #DLBAuto #Cars #Viral #Shorts"
                  value={modalCaption}
                  onChange={(e) => setModalCaption(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlot}
                  disabled={savingSlot}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0F172A',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {savingSlot ? 'सेव हो रहा है...' : 'स्लॉट में सेव करें'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
