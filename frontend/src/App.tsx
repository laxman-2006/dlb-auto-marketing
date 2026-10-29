import React, { useState, useEffect } from 'react';
import {
  Settings,
  Search,
  Star,
  Bell,
  MessageSquare,
  Users,
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
  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'telegram' | 'settings'>('whatsapp');
  const [currentView, setCurrentView] = useState<
    'wa-personal' | 'wa-group' | 'tg-personal' | 'tg-group' | 'settings'
  >('wa-personal');
  const [mobileShowContent, setMobileShowContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const handleSelectPlatform = (platform: 'whatsapp' | 'telegram' | 'settings') => {
    setActivePlatform(platform);
    if (platform === 'whatsapp') {
      if (currentView !== 'wa-personal' && currentView !== 'wa-group') {
        setCurrentView('wa-personal');
      }
      setMobileShowContent(false);
    } else if (platform === 'telegram') {
      if (currentView !== 'tg-personal' && currentView !== 'tg-group') {
        setCurrentView('tg-personal');
      }
      setMobileShowContent(false);
    } else if (platform === 'settings') {
      setCurrentView('settings');
      setMobileShowContent(true);
    }
  };

  const handleSelectChannel = (view: 'wa-personal' | 'wa-group' | 'tg-personal' | 'tg-group') => {
    setCurrentView(view);
    setMobileShowContent(true);
  };

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  return (
    <>
      {showIntro && <IntroScreen onComplete={() => setShowIntro(false)} />}
      <div className="bizz-app">
        {/* REGION A: Left Narrow Navigation Rail */}
        <nav className="left-rail">
          <div className="rail-top">
            {/* WhatsApp Platform Tab */}
            <button
              className={`rail-btn ${activePlatform === 'whatsapp' ? 'active' : ''}`}
              onClick={() => handleSelectPlatform('whatsapp')}
              title="WhatsApp Marketing (व्हाट्सएप)"
              style={{
                color: activePlatform === 'whatsapp' ? '#25D366' : undefined
              }}
            >
              <MessageSquare size={22} />
            </button>

            {/* Telegram Platform Tab */}
            <button
              className={`rail-btn ${activePlatform === 'telegram' ? 'active' : ''}`}
              onClick={() => handleSelectPlatform('telegram')}
              title="Telegram Marketing (टेलीग्राम)"
              style={{
                color: activePlatform === 'telegram' ? '#0088cc' : undefined
              }}
            >
              <Send size={22} />
            </button>
          </div>

          <div className="rail-bottom">
            <button
              className={`rail-btn ${activePlatform === 'settings' ? 'active' : ''}`}
              onClick={() => handleSelectPlatform('settings')}
              title="Settings (कनेक्शन और सेटिंग्स)"
            >
              <Settings size={22} />
            </button>
          </div>
        </nav>

        {/* REGION B: Left Middle Sidebar / Feed List */}
        <aside className={`left-sidebar ${mobileShowContent ? 'mobile-hide' : ''}`}>
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
                placeholder={
                  activePlatform === 'whatsapp'
                    ? 'Search WhatsApp channels...'
                    : activePlatform === 'telegram'
                    ? 'Search Telegram channels...'
                    : 'Search settings...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* Channels & Modes Navigation List (Separated by Platform) */}
          <div className="campaign-list-scroll">
            {/* WHATSAPP CHANNELS ONLY */}
            {activePlatform === 'whatsapp' && (
              <>
                <div style={{ padding: '8px 12px 6px', fontSize: '11px', fontWeight: 800, color: '#16A34A', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                  WHATSAPP MARKETING
                </div>

                {/* 1: WhatsApp Personal Message */}
                {matchesSearch('WhatsApp Personal Message Numbers') && (
                  <div
                    className={`campaign-nav-item ${currentView === 'wa-personal' ? 'active' : ''}`}
                    onClick={() => handleSelectChannel('wa-personal')}
                  >
                    <div className="campaign-item-avatar" style={{ background: '#25D366' }}>
                      <MessageSquare size={18} color="#ffffff" />
                    </div>
                    <div className="campaign-item-info">
                      <div className="campaign-item-title">WhatsApp Personal Message</div>
                      <div className="campaign-item-sub">Numbers + one message — each person gets individual copy</div>
                    </div>
                  </div>
                )}

                {/* 2: WhatsApp All Group */}
                {matchesSearch('WhatsApp All Group auto add numbers') && (
                  <div
                    className={`campaign-nav-item ${currentView === 'wa-group' ? 'active' : ''}`}
                    onClick={() => handleSelectChannel('wa-group')}
                  >
                    <div className="campaign-item-avatar" style={{ background: '#0284c7' }}>
                      <Users size={18} color="#ffffff" />
                    </div>
                    <div className="campaign-item-info">
                      <div className="campaign-item-title">WhatsApp All Group</div>
                      <div className="campaign-item-sub">One WhatsApp group — auto add from Excel/numbers</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TELEGRAM CHANNELS ONLY */}
            {activePlatform === 'telegram' && (
              <>
                <div style={{ padding: '8px 12px 6px', fontSize: '11px', fontWeight: 800, color: '#0284C7', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0088cc' }} />
                  TELEGRAM MARKETING
                </div>

                {/* 3: Telegram Personal Message */}
                {matchesSearch('Telegram Personal Message Phone username') && (
                  <div
                    className={`campaign-nav-item ${currentView === 'tg-personal' ? 'active' : ''}`}
                    onClick={() => handleSelectChannel('tg-personal')}
                  >
                    <div className="campaign-item-avatar" style={{ background: '#0088cc' }}>
                      <Send size={18} color="#ffffff" />
                    </div>
                    <div className="campaign-item-info">
                      <div className="campaign-item-title">Telegram Personal Message</div>
                      <div className="campaign-item-sub">Phone / @Username — individual Telegram copies</div>
                    </div>
                  </div>
                )}

                {/* 4: Telegram All Groups */}
                {matchesSearch('Telegram All Groups broadcast add members') && (
                  <div
                    className={`campaign-nav-item ${currentView === 'tg-group' ? 'active' : ''}`}
                    onClick={() => handleSelectChannel('tg-group')}
                  >
                    <div className="campaign-item-avatar" style={{ background: '#0284C7' }}>
                      <Users size={18} color="#ffffff" />
                    </div>
                    <div className="campaign-item-info">
                      <div className="campaign-item-title">Telegram All Groups</div>
                      <div className="campaign-item-sub">Telegram broadcast group — auto add members & broadcast</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* SETTINGS ONLY */}
            {activePlatform === 'settings' && (
              <>
                <div style={{ padding: '8px 12px 6px', fontSize: '11px', fontWeight: 800, color: '#64748B', letterSpacing: '0.6px' }}>
                  SETTINGS & CONNECTIONS
                </div>
                <div
                  className={`campaign-nav-item active`}
                  onClick={() => {
                    setCurrentView('settings');
                    setMobileShowContent(true);
                  }}
                >
                  <div className="campaign-item-avatar" style={{ background: '#475569' }}>
                    <Settings size={18} color="#ffffff" />
                  </div>
                  <div className="campaign-item-info">
                    <div className="campaign-item-title">Account Connections & Settings</div>
                    <div className="campaign-item-sub">Manage WhatsApp QR, Telegram phone/bot, safe pacing</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* REGION C: Main Content Workspace */}
        <main
          className={`main-content-pane ${!mobileShowContent ? 'mobile-hide' : ''}`}
          style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}
        >
          {currentView === 'wa-personal' && (
            <PersonalMessagesView
              onNavigateSettings={() => handleSelectPlatform('settings')}
              onBack={() => setMobileShowContent(false)}
            />
          )}
          {currentView === 'wa-group' && (
            <AllMemberGroupView
              onNavigateSettings={() => handleSelectPlatform('settings')}
              onBack={() => setMobileShowContent(false)}
            />
          )}
          {currentView === 'tg-personal' && (
            <TelegramPersonalView
              onNavigateSettings={() => handleSelectPlatform('settings')}
              onBack={() => setMobileShowContent(false)}
            />
          )}
          {currentView === 'tg-group' && (
            <TelegramAllGroupView
              onNavigateSettings={() => handleSelectPlatform('settings')}
              onBack={() => setMobileShowContent(false)}
            />
          )}
          {currentView === 'settings' && (
            <SettingsView onBack={() => setMobileShowContent(false)} />
          )}
        </main>
      </div>
    </>
  );
};

export default App;
