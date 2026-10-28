import React, { useState, useEffect } from 'react';
import {
  Home,
  Settings,
  Search,
  Star,
  Bell,
  MessageSquare,
  Users,
  Download,
  Wifi,
  WifiOff
} from 'lucide-react';
import { PersonalMessagesView } from './components/PersonalMessagesView';
import { AllMemberGroupView } from './components/AllMemberGroupView';
import { SettingsView } from './components/SettingsView';
import { IntroScreen } from './components/IntroScreen';
import { api } from './api';

export const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [currentView, setCurrentView] = useState<'home' | 'group' | 'settings'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [waConnected, setWaConnected] = useState(false);

  useEffect(() => {
    const checkWa = async () => {
      try {
        const res = await api.getWhatsAppStatus();
        setWaConnected(res.connected === true || res.state === 'CONNECTED');
      } catch (e) {
        setWaConnected(false);
      }
    };
    checkWa();
    const interval = setInterval(checkWa, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {showIntro && <IntroScreen onComplete={() => setShowIntro(false)} />}
      <div className="bizz-app">
      {/* REGION A: Left Narrow Navigation Rail */}
      <nav className="left-rail">
        <div className="rail-top">
          <button
            className={`rail-btn ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentView('home')}
            title="Personal Messages / Home"
          >
            <Home size={22} />
          </button>
          <button
            className={`rail-btn ${currentView === 'group' ? 'active' : ''}`}
            onClick={() => setCurrentView('group')}
            title="All Member Group (ग्रुप)"
          >
            <Users size={22} />
          </button>
        </div>

        <div className="rail-bottom">
          <button
            className={`rail-btn ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            title="Settings"
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
            <div className="brand-logo-circle">
              <img
                src="/dlb-logo.png"
                alt="DLB AUTO MARKETING Logo"
                className="brand-logo-img"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="brand-text-block">
              <span className="brand-title">DLB AUTO</span>
              <span className="brand-sub">MARKETING</span>
            </div>
          </div>
          <div className="sidebar-brand-actions">
            <span className={`status-pill ${waConnected ? 'online' : 'offline'}`}>
              {waConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {waConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
            <button className="icon-btn-ghost" title="Starred">
              <Star size={16} />
            </button>
            <button className="icon-btn-ghost" title="Notifications">
              <Bell size={16} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="sidebar-search-box">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search reports and messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Promo / Home Screen Banner */}
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

        {/* Campaign List */}
        <div className="campaign-list-scroll">
          {/* Card 1: Personal Messages */}
          <div
            className={`campaign-nav-item ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentView('home')}
          >
            <div className="campaign-item-avatar">
              <MessageSquare size={20} />
            </div>
            <div className="campaign-item-info">
              <div className="campaign-item-title">Personal Messages</div>
              <div className="campaign-item-sub">Numbers + one message — each person gets individual copy</div>
            </div>
          </div>

          {/* Card 2: All Member Group */}
          <div
            className={`campaign-nav-item ${currentView === 'group' ? 'active' : ''}`}
            onClick={() => setCurrentView('group')}
          >
            <div className="campaign-item-avatar" style={{ background: '#0284c7' }}>
              <Users size={20} color="#ffffff" />
            </div>
            <div className="campaign-item-info">
              <div className="campaign-item-title">All Member Group (ग्रुप)</div>
              <div className="campaign-item-sub">One WhatsApp group — auto add from Excel/numbers</div>
            </div>
          </div>
        </div>
      </aside>

      {/* REGION C: Main Content Workspace */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {currentView === 'home' && <PersonalMessagesView onNavigateSettings={() => setCurrentView('settings')} />}
        {currentView === 'group' && <AllMemberGroupView onNavigateSettings={() => setCurrentView('settings')} />}
        {currentView === 'settings' && <SettingsView />}
      </main>
    </div>
    </>
  );
};

export default App;
