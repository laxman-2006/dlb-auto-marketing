import React from 'react';
import {
  MessageSquare,
  Send,
  Video,
  Scissors,
  Sparkles,
  Settings,
  ChevronRight,
  Clock,
  ShieldCheck,
  Film
} from 'lucide-react';
import { YoutubeIcon, InstagramIcon, FacebookIcon } from './SocialIcons';

interface HomeScreenProps {
  onSelectHub: (hub: 'messages' | 'video-uploader' | 'video-clip' | 'settings') => void;
  waConnected?: boolean;
  tgConnected?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectHub
}) => {
  return (
    <div className="home-dashboard-container">
      {/* Subtle Brand Watermark in Center */}
      <div className="main-watermark-bg" aria-hidden="true" />

      {/* Top Bar with DLB Brand & Settings Quick Action */}
      <header className="home-top-bar">
        <div className="home-brand-wrapper">
          <div className="brand-logo-circle" title="DLB AUTO MARKETING">
            <img
              src="/logo.jpg"
              alt="DLB AUTO MARKETING"
              className="brand-logo-img"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src.endsWith('/logo.jpg')) {
                  target.src = '/dlb-logo.png';
                }
              }}
            />
          </div>
          <div>
            <div className="home-brand-title">DLB AUTO MARKETING</div>
            <div className="home-brand-tagline">Central Automation & Multi-Platform Marketing Hub</div>
          </div>
        </div>

        <div className="home-top-actions">
          <button
            className="home-settings-btn"
            onClick={() => onSelectHub('settings')}
            title="Accounts & Settings"
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main Hero Header */}
      <div className="home-hero-text">
        <h1 className="home-hero-title">
          आप क्या चलाना चाहते हैं? <span className="home-gold-gradient">Choose Workflow</span>
        </h1>
        <p className="home-hero-subtitle">
          DLB Auto Marketing का ऑल-इन-वन हब: डायरेक्ट मैसेजिंग, सोशल मीडिया वीडियो शेड्यूलर और 4K 60FPS रील जनरेटर
        </p>
      </div>

      {/* The 3 Core Command Cards */}
      <div className="home-cards-grid">
        {/* CARD 1: Direct Marketing Messages (WhatsApp + Telegram) */}
        <div
          className="home-hub-card card-messages"
          onClick={() => onSelectHub('messages')}
          role="button"
          tabIndex={0}
        >
          <div className="hub-card-glow glow-green" />
          <div className="hub-card-header">
            <div className="hub-icon-bubble bubble-messages">
              <MessageSquare size={26} color="#ffffff" />
            </div>
            <span className="hub-badge badge-green">
              <ShieldCheck size={14} /> WhatsApp & Telegram
            </span>
          </div>

          <h2 className="hub-card-title">1. मैसेज (Direct Messages)</h2>
          <p className="hub-card-desc">
            WhatsApp और Telegram पर पर्सनल मैसेज व ग्रुप मार्केटिंग। एक्सेल अपलोड से हजारों लोगों को सुरक्षित एंटी-बैन स्पीड (10-15/घंटा) से मैसेज भेजें।
          </p>

          <div className="hub-card-features">
            <div className="hub-feat-pill">
              <MessageSquare size={13} color="#25D366" />
              <span>WhatsApp Personal & All Group</span>
            </div>
            <div className="hub-feat-pill">
              <Send size={13} color="#0088cc" />
              <span>Telegram Personal & 200,000 Groups</span>
            </div>
          </div>

          <div className="hub-card-footer">
            <span className="hub-action-label">मैसेज डैशबोर्ड खोलें</span>
            <div className="hub-arrow-circle">
              <ChevronRight size={18} />
            </div>
          </div>
        </div>

        {/* CARD 2: Automatic Video Upload (YouTube, Instagram, Facebook) */}
        <div
          className="home-hub-card card-uploader"
          onClick={() => onSelectHub('video-uploader')}
          role="button"
          tabIndex={0}
        >
          <div className="hub-card-glow glow-blue" />
          <div className="hub-card-header">
            <div className="hub-icon-bubble bubble-uploader">
              <Video size={26} color="#ffffff" />
            </div>
            <span className="hub-badge badge-purple">
              <Clock size={14} /> Daily Scheduled Slots
            </span>
          </div>

          <h2 className="hub-card-title">2. ऑटोमेटिक वीडियो अपलोड (Auto Video Upload)</h2>
          <p className="hub-card-desc">
            YouTube, Instagram और Facebook पर तय समय अनुसार अपने आप वीडियो, रील और पोस्ट पब्लिश करें। हर घंटे Facebook पर पोस्ट और रील शेड्यूल करें।
          </p>

          <div className="hub-card-features">
            <div className="hub-feat-pill">
              <YoutubeIcon size={14} color="#FF0000" />
              <span>YouTube: सुबह 07:15 & शाम 07:15 (2 Daily)</span>
            </div>
            <div className="hub-feat-pill">
              <InstagramIcon size={14} color="#E1306C" />
              <span>Instagram: सुबह 07:15 & शाम 07:15 (2 Reels)</span>
            </div>
            <div className="hub-feat-pill">
              <FacebookIcon size={14} color="#1877F2" />
              <span>Facebook: हर घंटे रील (:00) & पोस्ट (:30) — 48 Daily</span>
            </div>
          </div>

          <div className="hub-card-footer">
            <span className="hub-action-label">ऑटो वीडियो शेड्यूलर खोलें</span>
            <div className="hub-arrow-circle">
              <ChevronRight size={18} />
            </div>
          </div>
        </div>

        {/* CARD 3: Video Clip / 30s 9:16 4K Reel Studio */}
        <div
          className="home-hub-card card-clipper"
          onClick={() => onSelectHub('video-clip')}
          role="button"
          tabIndex={0}
        >
          <div className="hub-card-glow glow-gold" />
          <div className="hub-card-header">
            <div className="hub-icon-bubble bubble-clipper">
              <Scissors size={26} color="#ffffff" />
            </div>
            <span className="hub-badge badge-gold">
              <Sparkles size={14} /> 30s 9:16 4K 60FPS
            </span>
          </div>

          <h2 className="hub-card-title">3. वीडियो क्लिप & रील (Video Clip Studio)</h2>
          <p className="hub-card-desc">
            1 घंटे या किसी भी बड़े गेमिंग वीडियो को डालें। यह अपने आप 30-30 सेकंड की सुपर हाई-क्वालिटी 9:16 वर्टिकल 4K 60FPS रील बना देगा (1 घंटा = 120 रील)।
          </p>

          <div className="hub-card-features">
            <div className="hub-feat-pill">
              <Film size={13} color="#D4A64A" />
              <span>30-Second Exact Viral Clips</span>
            </div>
            <div className="hub-feat-pill">
              <Sparkles size={13} color="#D4A64A" />
              <span>9:16 Vertical Ratio (Phone & Shorts)</span>
            </div>
            <div className="hub-feat-pill">
              <Clock size={13} color="#D4A64A" />
              <span>4K 60FPS Ultra Gaming Resolution</span>
            </div>
          </div>

          <div className="hub-card-footer">
            <span className="hub-action-label">रील क्लिपर स्टूडियो खोलें</span>
            <div className="hub-arrow-circle">
              <ChevronRight size={18} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
