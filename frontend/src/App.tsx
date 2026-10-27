import React, { useState } from 'react';
import {
  Home,
  Settings,
  Search,
  Star,
  Bell,
  MessageSquare,
  Download
} from 'lucide-react';
import { PersonalMessagesView } from './components/PersonalMessagesView';
import { SettingsView } from './components/SettingsView';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'settings'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBanner, setShowBanner] = useState(true);

  return (
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

      {/* REGION B: Conversation and Campaign Sidebar */}
      <aside className="campaign-sidebar">
        {/* Brand Header */}
        <div className="sidebar-brand-header">
          <div className="brand-identity">
            <div className="brand-avatar">D</div>
            <span className="brand-name">DLB AUTO MARKETING</span>
          </div>
          <div className="sidebar-header-actions">
            <button className="header-icon-btn" title="Favourites">
              <Star size={18} />
            </button>
            <button className="header-icon-btn" title="Notifications">
              <Bell size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              className="search-input"
              placeholder="Search reports and messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Optional Add to Home Screen Banner matching Screenshot 1 */}
        {showBanner && (
          <div className="homescreen-banner">
            <div className="banner-left">
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
          <div
            className={`campaign-nav-item ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentView('home')}
          >
            <div className="campaign-item-avatar">
              <MessageSquare size={20} />
            </div>
            <div className="campaign-item-info">
              <div className="campaign-item-title">Personal Messages</div>
              <div className="campaign-item-sub">Numbers + one message — each person ge...</div>
            </div>
          </div>
        </div>
      </aside>

      {/* REGION C: Main Content Workspace */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {currentView === 'home' && <PersonalMessagesView />}
        {currentView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};

export default App;
