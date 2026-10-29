import React, { useState, useEffect } from 'react';
import {
  Settings,
  Search,
  Star,
  Bell,
  MessageSquare,
  Users,
  Download,
  Wifi,
  WifiOff,
  Send
} from 'lucide-react';
import { PersonalMessagesView } from './components/PersonalMessagesView';
import { AllMemberGroupView } from './components/AllMemberGroupView';
import { TelegramPersonalView } from './components/TelegramPersonalView';
import { TelegramAllGroupView } from './components/TelegramAllGroupView';
import { SettingsView } from './components/SettingsView';
import { IntroScreen } from './components/IntroScreen';
import { api } from './api';

export const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [currentView, setCurrentView] = useState<
    'wa-personal' | 'wa-group' | 'tg-personal' | 'tg-group' | 'settings'
  >('wa-personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [waConnected, setWaConnected] = useState(false);
  const [tgConnected, setTgConnected] = useState(false);

  useEffect(() => {
    const checkStatuses = async () => {
      try {
        const wa = await api.getWhatsAppStatus();
        setWaConnected(wa.connected === true || wa.state === 'CONNECTED');
      } catch {
        setWaConnected(false);
      }

      try {
        const tg = await api.getTelegramStatus();
        setTgConnected(tg.connected === true || tg.state === 'CONNECTED');
      } catch {
        setTgConnected(false);
      }
    };

    checkStatuses();
    const interval = setInterval(checkStatuses, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {showIntro && <IntroScreen onComplete={() => setShowIntro(false)} />}
      <div className="bizz-app">
        {/* REGION A: Left Narrow Navigation Rail */}
        <nav className="left-rail">
          <div className="rail-top">
            {/* WhatsApp Personal */}
            <button
              className={`rail-btn ${currentView === 'wa-personal' ? 'active' : ''}`}
              onClick={() => setCurrentView('wa-personal')}
              title="WhatsApp Personal Message"
            >
              <MessageSquare size={20} />
            </button>

            {/* WhatsApp Group */}
            <button
              className={`rail-btn ${currentView === 'wa-group' ? 'active' : ''}`}
              onClick={() => setCurrentView('wa-group')}
              title="WhatsApp All Group"
            >
              <Users size={20} />
            </button>

            {/* Telegram Personal */}
            <button
              className={`rail-btn ${currentView === 'tg-personal' ? 'active' : ''}`}
              onClick={() => setCurrentView('tg-personal')}
              title="Telegram Personal Message"
              style={{ color: currentView === 'tg-personal' ? '#0088cc' : undefined }}
            >
              <Send size={20} />
            </button>

            {/* Telegram Groups */}
            <button
              className={`rail-btn ${currentView === 'tg-group' ? 'active' : ''}`}
              onClick={() => setCurrentView('tg-group')}
              title="Telegram All Groups"
              style={{ color: currentView === 'tg-group' ? '#0088cc' : undefined }}
            >
              <Users size={20} />
            </button>
          </div>

          <div className="rail-bottom">
            <button
              className={`rail-btn ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
              title="Settings (WhatsApp & Telegram Connect)"
            >
              <Settings size={22} />
            </button>
          </div>
        </nav>

        {/* REGION B: Left Middle Sidebar / Feed List */}
        <aside className="left-sidebar">
          {/* Brand Header */}
          <div className="sidebar-brand-header">
            <div className="sidebar-brand-left">
              <div className="brand-logo-circle" title="DLB AUTO MARKETING">
                <img
                  src="/logo.jpg"
                  alt="DLB AUTO MARKETING Logo"
                  className="brand-logo-img"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src.endsWith('/logo.jpg')) {
                      target.src = '/dlb-logo.png';
                    }
                  }}
                />
              </div>
              <div className="brand-text-block">
                <span className="brand-title">DLB AUTO</span>
                <span className="brand-sub">MARKETING</span>
              </div>
            </div>

            <div className="sidebar-brand-actions" style={{ gap: '6px' }}>
              {/* WhatsApp Status Pill */}
              <span
                className={`status-pill ${waConnected ? 'online' : 'offline'}`}
                title={`WhatsApp: ${waConnected ? 'Online' : 'Offline'}`}
                style={{ fontSize: '10px', padding: '2px 6px' }}
              >
                WA {waConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              </span>

              {/* Telegram Status Pill */}
              <span
                className={`status-pill ${tgConnected ? 'online' : 'offline'}`}
                title={`Telegram: ${tgConnected ? 'Online' : 'Offline'}`}
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  background: tgConnected ? '#E0F2FE' : '#FEE2E2',
                  color: tgConnected ? '#0369A1' : '#991B1B',
                  borderColor: tgConnected ? '#BAE6FD' : '#FECACA'
                }}
              >
                TG {tgConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              </span>

              <button className="icon-btn-ghost" title="Starred">
                <Star size={14} />
              </button>
              <button className="icon-btn-ghost" title="Notifications">
                <Bell size={14} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="sidebar-search-box">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search marketing channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* Home Screen Shortcut Banner */}
          {showBanner && (
            <div className="banner-pwa">
              <div className="banner-text">
                <Download size={14} color="#204f38" />
                <span>Add DLB to your home screen</span>
              </div>
              <div className="banner-actions">
                <button
                  className="btn-banner-add"
                  onClick={() => alert('DLB AUTO MARKETING shortcut added to desktop.')}
                >
                  Add
                </button>
                <button className="banner-close-btn" onClick={() => setShowBanner(false)}>
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Channels & Modes Navigation List */}
          <div className="campaign-list-scroll">
            {/* Section 1 Header */}
            <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>
              WHATSAPP MARKETING
            </div>

            {/* 1: WhatsApp Personal Message */}
            <div
              className={`campaign-nav-item ${currentView === 'wa-personal' ? 'active' : ''}`}
              onClick={() => setCurrentView('wa-personal')}
            >
              <div className="campaign-item-avatar" style={{ background: '#25D366' }}>
                <MessageSquare size={18} color="#ffffff" />
              </div>
              <div className="campaign-item-info">
                <div className="campaign-item-title">WhatsApp Personal Message</div>
                <div className="campaign-item-sub">Numbers + one message — each person gets individual copy</div>
              </div>
            </div>

            {/* 2: WhatsApp All Group */}
            <div
              className={`campaign-nav-item ${currentView === 'wa-group' ? 'active' : ''}`}
              onClick={() => setCurrentView('wa-group')}
            >
              <div className="campaign-item-avatar" style={{ background: '#0284c7' }}>
                <Users size={18} color="#ffffff" />
              </div>
              <div className="campaign-item-info">
                <div className="campaign-item-title">WhatsApp All Group</div>
                <div className="campaign-item-sub">One WhatsApp group — auto add from Excel/numbers</div>
              </div>
            </div>

            {/* Section 2 Header */}
            <div style={{ padding: '16px 12px 4px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>
              TELEGRAM MARKETING
            </div>

            {/* 3: Telegram Personal Message */}
            <div
              className={`campaign-nav-item ${currentView === 'tg-personal' ? 'active' : ''}`}
              onClick={() => setCurrentView('tg-personal')}
            >
              <div className="campaign-item-avatar" style={{ background: '#0088cc' }}>
                <Send size={18} color="#ffffff" />
              </div>
              <div className="campaign-item-info">
                <div className="campaign-item-title">Telegram Personal Message</div>
                <div className="campaign-item-sub">Phone / @Username — individual Telegram copies</div>
              </div>
            </div>

            {/* 4: Telegram All Groups */}
            <div
              className={`campaign-nav-item ${currentView === 'tg-group' ? 'active' : ''}`}
              onClick={() => setCurrentView('tg-group')}
            >
              <div className="campaign-item-avatar" style={{ background: '#0284C7' }}>
                <Users size={18} color="#ffffff" />
              </div>
              <div className="campaign-item-info">
                <div className="campaign-item-title">Telegram All Groups</div>
                <div className="campaign-item-sub">Telegram broadcast group — auto add members & broadcast</div>
              </div>
            </div>
          </div>
        </aside>

        {/* REGION C: Main Content Workspace */}
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {currentView === 'wa-personal' && (
            <PersonalMessagesView onNavigateSettings={() => setCurrentView('settings')} />
          )}
          {currentView === 'wa-group' && (
            <AllMemberGroupView onNavigateSettings={() => setCurrentView('settings')} />
          )}
          {currentView === 'tg-personal' && (
            <TelegramPersonalView onNavigateSettings={() => setCurrentView('settings')} />
          )}
          {currentView === 'tg-group' && (
            <TelegramAllGroupView onNavigateSettings={() => setCurrentView('settings')} />
          )}
          {currentView === 'settings' && <SettingsView />}
        </main>
      </div>
    </>
  );
};

export default App;
