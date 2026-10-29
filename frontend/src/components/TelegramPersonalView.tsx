import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import {
  Send,
  Search,
  Upload,
  Edit3,
  Download,
  Image,
  Mic,
  Paperclip,
  X,
  User,
  Plus,
  Check,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { PasteNumbersModal } from './PasteNumbersModal';
import { UploadExcelModal } from './UploadExcelModal';
import { CampaignProgressCard } from './CampaignProgressCard';

interface TelegramContactItem {
  id: string;
  name: string;
  phone: string; // phone number (+91...) or @username
  tag?: string;
}

interface TelegramPersonalViewProps {
  onNavigateSettings?: () => void;
  onBack?: () => void;
}

export const TelegramPersonalView: React.FC<TelegramPersonalViewProps> = ({ onNavigateSettings, onBack }) => {
  const [feed, setFeed] = useState<any[]>([]);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  // Telegram connection status
  const [tgConnected, setTgConnected] = useState(false);
  const [tgName, setTgName] = useState('');
  const [tgUsername, setTgUsername] = useState<string | null>(null);
  const [tgPhone, setTgPhone] = useState<string | null>(null);

  // Search Telegram Drawer matching Screenshot 1 & 2
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TelegramContactItem[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<TelegramContactItem[]>([]);

  // Modals & Popups
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);

  // Inline feedback toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStatus = async () => {
    try {
      const st = await api.getTelegramStatus();
      setTgConnected(st.connected === true);
      if (st.verifiedName) setTgName(st.verifiedName);
      if (st.username) setTgUsername(st.username);
      if (st.displayPhoneNumber) setTgPhone(st.displayPhoneNumber);
    } catch (err) {
      console.error(err);
    }
  };

  const loadFeed = async () => {
    try {
      const res = await api.getTelegramFeed();
      if (res.success) {
        setFeed(res.feed || []);
      }
    } catch (err) {
      console.error('Failed to load telegram campaign feed:', err);
    }
  };

  useEffect(() => {
    loadFeed();
    loadStatus();
    const interval = setInterval(() => {
      loadFeed();
      loadStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Search Telegram contacts & dialogs as user types
  useEffect(() => {
    if (!showSearchDrawer) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await api.getTelegramDialogs(searchQuery.trim());
        const mapped: TelegramContactItem[] = (res.contacts || []).map((c: any) => ({
          id: c.id,
          name: c.name || 'Telegram User',
          phone: c.phone || c.id,
          tag: c.tag || 'Contact'
        }));

        // Allow direct phone number or @username entry
        const trimmed = searchQuery.trim();
        const rawDigits = trimmed.replace(/[^\d]/g, '');

        if (rawDigits.length >= 10) {
          const formatted = rawDigits.length === 10 ? `+91${rawDigits}` : `+${rawDigits}`;
          const already = mapped.some((m) => m.phone.includes(rawDigits));
          if (!already) {
            mapped.unshift({
              id: `custom_${rawDigits}`,
              name: formatted,
              phone: formatted,
              tag: 'New Phone'
            });
          }
        } else if (trimmed.startsWith('@') && trimmed.length >= 3) {
          const already = mapped.some((m) => m.phone.toLowerCase() === trimmed.toLowerCase());
          if (!already) {
            mapped.unshift({
              id: `custom_${trimmed}`,
              name: trimmed,
              phone: trimmed,
              tag: 'Telegram Username'
            });
          }
        }

        setSearchResults(mapped);
      } catch (err) {
        console.error('Telegram search error:', err);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, showSearchDrawer]);

  const handleOpenSearchDrawer = () => {
    setShowAttachMenu(false);
    setShowSearchDrawer(true);
    setSearchQuery('');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleToggleRecipient = (contact: TelegramContactItem) => {
    const isSelected = selectedRecipients.some((r) => r.phone === contact.phone);
    if (isSelected) {
      setSelectedRecipients((prev) => prev.filter((r) => r.phone !== contact.phone));
    } else {
      setSelectedRecipients((prev) => [...prev, contact]);
    }
  };

  const handleRemoveRecipient = (phone: string) => {
    setSelectedRecipients((prev) => prev.filter((r) => r.phone !== phone));
  };

  const handleSendBroadcast = async () => {
    if (!messageText.trim() && !attachedFile) {
      showToast('error', 'Please enter a message or attach a file.');
      return;
    }

    if (selectedRecipients.length === 0) {
      showToast('info', 'Please search and select at least one recipient first.');
      setShowSearchDrawer(true);
      return;
    }

    setSending(true);
    try {
      const recipientPhones = selectedRecipients.map((r) => r.phone);

      const formData = new FormData();
      formData.append('recipients', JSON.stringify(recipientPhones));
      formData.append('messageText', messageText.trim() || 'Photo Attachment');
      if (attachedFile) {
        formData.append('media', attachedFile);
      }

      const resSend = await api.quickSendTelegram(formData);
      if (resSend && resSend.campaignId) {
        setSelectedCampId(resSend.campaignId);
      }

      setMessageText('');
      setAttachedFile(null);
      setSelectedRecipients([]);
      setShowSearchDrawer(false);
      showToast('success', `Message sent to ${recipientPhones.length} Telegram recipient${recipientPhones.length > 1 ? 's' : ''}!`);
      await loadFeed();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to dispatch Telegram message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!window.confirm('क्या आप इस मैसेज सेट/बैच को हटाना चाहते हैं?')) return;
    try {
      await api.deleteTelegramCampaign(id);
      showToast('success', 'मैसेज बैच सफलतापूर्वक हटाया गया!');
      if (selectedCampId === id) setSelectedCampId(null);
      loadFeed();
    } catch (err: any) {
      showToast('error', err?.message || 'बैच हटाने में विफल');
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFile(e.target.files[0]);
      setShowAttachMenu(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/import/template';
    setShowAttachMenu(false);
  };

  // Active batch selection: if user clicked a specific set, show its metrics; otherwise show latest
  const activeCamp = (selectedCampId ? feed.find((c) => c.id === selectedCampId) : null) || (feed.length > 0 ? feed[0] : null);
  const totalEligible = activeCamp ? (activeCamp.total_recipients || 1) : 0;
  const deliveredCount = activeCamp ? (activeCamp.delivered_count || activeCamp.sent_count || 0) : 0;
  const failedCount = activeCamp ? (activeCamp.failed_count || 0) : 0;
  const pendingCount = Math.max(0, totalEligible - (deliveredCount + failedCount));
  const readCount = activeCamp?.read_count || 0;

  return (
    <div className="main-conversation-pane">
      {/* Subtle Background Watermark Logo */}
      <div className="main-watermark-bg" aria-hidden="true" />

      {/* Top Header */}
      <header className="conversation-header">
        {onBack && (
          <button className="mobile-back-btn" onClick={onBack} title="Back to Channels">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="conv-header-avatar" style={{ background: '#0088cc', color: '#ffffff' }}>
          <Send size={20} />
        </div>
        <div className="conv-header-text">
          <div className="conv-header-title">
            Telegram Personal Messages
            {tgConnected ? (
              <span className="status-tag done" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#E0F2FE', color: '#0369A1' }}>
                <span className="metrics-live-dot" style={{ width: 6, height: 6, background: '#0284c7' }} />
                Live Telegram {tgUsername || tgName || (tgPhone ? `(${tgPhone})` : 'Connected')}
              </span>
            ) : (
              <span
                onClick={onNavigateSettings}
                className="status-tag"
                style={{
                  fontSize: '11px',
                  cursor: 'pointer',
                  background: '#FEE2E2',
                  color: '#991B1B',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '12px'
                }}
                title="Click to connect Telegram in Settings"
              >
                🔴 Disconnected — Connect Telegram
              </span>
            )}
          </div>
          <div className="conv-header-sub">One message — each recipient receives their own direct copy via Telegram</div>
        </div>
      </header>

      {/* Disconnected Alert Banner */}
      {!tgConnected && (
        <div
          onClick={onNavigateSettings}
          style={{
            margin: '14px 28px 0',
            padding: '12px 18px',
            background: '#EFF6FF',
            border: '1.5px solid #93C5FD',
            borderRadius: '10px',
            color: '#1E40AF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>✈️</span>
            <span>
              <strong>Telegram कनेक्ट नहीं है:</strong> Telegram QR कोड स्कैन करने या Bot टोकन से कनेक्ट करने के लिए यहाँ क्लिक करें।
            </span>
          </div>
          <span style={{ background: '#0088cc', color: '#ffffff', padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
            Connect Telegram →
          </span>
        </div>
      )}

      {/* Campaign Progress Display for Selected or Latest Batch */}
      {activeCamp && (
        <CampaignProgressCard
          campaignId={activeCamp.id}
          campaignName={activeCamp.name || 'Telegram Blast'}
          status={activeCamp.status_label || activeCamp.status || 'Active'}
          totalRecipients={totalEligible}
          delivered={deliveredCount}
          pending={pendingCount}
          failed={failedCount}
          readCount={readCount}
          onRetryFailed={() => {
            loadFeed();
            showToast('success', 'Refreshed Telegram metrics!');
          }}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '10px 20px',
            borderRadius: '24px',
            fontSize: '13.5px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            backgroundColor: toastMessage.type === 'success' ? '#0369a1' : toastMessage.type === 'error' ? '#991b1b' : '#0f172a',
            color: '#ffffff'
          }}
        >
          {toastMessage.type === 'success' && <CheckCircle2 size={16} />}
          {toastMessage.type === 'error' && <AlertCircle size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Central Campaign Feed: Batch Sets (सेट बॉक्सेस) */}
      <div className="campaign-feed">
        {feed.map((card) => {
          const isSelected = activeCamp?.id === card.id;
          const isDone = card.status === 'COMPLETED' || card.status_label === 'Completed';
          const count = card.total_recipients || 1;
          const msg = card.message_snippet || card.message_text || 'Marketing message';
          const cardDelivered = card.delivered_count || card.sent_count || 0;
          const cardFailed = card.failed_count || 0;
          const cardPending = Math.max(0, count - (cardDelivered + cardFailed));

          return (
            <div
              key={card.id}
              className={`campaign-bubble-card ${isSelected ? 'active-set' : ''}`}
              onClick={() => setSelectedCampId(card.id)}
              title="इस सेट का विवरण देखने के लिए क्लिक करें (Click to view metrics for this set)"
            >
              <div className="bubble-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="bubble-campaign-name">{card.name || 'Telegram Blast'}</span>
                  {isSelected && (
                    <span className="active-set-badge">
                      <CheckCircle2 size={11} /> चयनित सेट (Active)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`status-tag ${isDone ? 'done' : 'stopped'}`}>
                    {isDone ? 'Completed' : 'Active'}
                  </span>
                  <button
                    className="batch-delete-btn"
                    title="यह सेट हटाएं (Delete this batch)"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBatch(card.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="bubble-message-preview">{msg}</div>

              {/* Mini Stats Bar for this Batch */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap', fontSize: '11.5px', fontWeight: 600 }}>
                <span style={{ color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                  कुल: {count}
                </span>
                <span style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                  सफल: {cardDelivered}
                </span>
                {cardFailed > 0 && (
                  <span style={{ color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                    विफल: {cardFailed}
                  </span>
                )}
                {cardPending > 0 && (
                  <span style={{ color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                    पेंडिंग: {cardPending}
                  </span>
                )}
              </div>

              {/* Recipients Detail List for this specific batch */}
              {card.messages && card.messages.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {card.messages.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        background: '#f8fafc',
                        borderRadius: '6px',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#334155' }}>To: {m.recipient}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: m.status === 'SENT' ? '#16a34a' : '#dc2626'
                        }}
                      >
                        {m.status === 'SENT' ? '✓ DELIVERED' : `✕ ${m.error_message || 'FAILED'}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bubble-footer-meta" style={{ marginTop: '10px' }}>
                <span>{new Date(card.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ marginLeft: 'auto', color: '#0088cc', fontWeight: 600 }}>
                  {count} Telegram Recipients
                </span>
              </div>
            </div>
          );
        })}

        {feed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✈️</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
              No Telegram messages sent yet
            </div>
            <div style={{ fontSize: '13px' }}>
              Click the paperclip button 📎 below to search Telegram contacts, upload an Excel sheet, or paste numbers.
            </div>
          </div>
        )}
      </div>

      {/* Search Telegram Drawer */}
      {showSearchDrawer && (
        <div
          style={{
            position: 'absolute',
            bottom: '76px',
            left: '20px',
            right: '20px',
            maxHeight: '380px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            border: '1px solid #CBD5E1',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#F8FAFC'
            }}
          >
            <Search size={18} color="#0088cc" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search to Telegram (chats, numbers, @usernames)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '14px',
                color: '#0F172A'
              }}
            />
            <X
              size={18}
              style={{ cursor: 'pointer', color: '#64748B' }}
              onClick={() => setShowSearchDrawer(false)}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {searchResults.length > 0 ? (
              searchResults.map((contact) => {
                const isSelected = selectedRecipients.some((r) => r.phone === contact.phone);
                return (
                  <div
                    key={contact.id}
                    onClick={() => handleToggleRecipient(contact)}
                    style={{
                      padding: '10px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#F0F9FF' : 'transparent',
                      borderBottom: '1px solid #F1F5F9'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                        {contact.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        {contact.phone} • <span style={{ color: '#0088cc' }}>{contact.tag}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? '#0088cc' : '#f0f2f5',
                        color: isSelected ? '#ffffff' : '#54656f'
                      }}
                    >
                      {isSelected ? <Check size={16} /> : <Plus size={16} />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748B' }}>
                {searchQuery
                  ? `No contacts matching "${searchQuery}". Type a 10-digit number (+91) or @username to add.`
                  : 'Type a name, phone number (+91...), or @username to search...'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Recipients Chips Bar */}
      {selectedRecipients.length > 0 && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderTop: '1px solid #E2E8F0',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0088cc' }}>To (Telegram):</span>
          {selectedRecipients.map((r) => (
            <span
              key={r.phone}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#E0F2FE',
                color: '#0369A1',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <User size={12} /> {r.name} ({r.phone})
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => handleRemoveRecipient(r.phone)}
              />
            </span>
          ))}

          <button
            onClick={() => setShowSearchDrawer(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0088cc',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Add more
          </button>

          <button
            onClick={() => setSelectedRecipients([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '11.5px',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Attachment Popup Menu matching Screenshot 1 */}
      {showAttachMenu && (
        <div className="attachment-popup-menu" style={{ left: '16px' }}>
          <div className="menu-section-title">NUMBERS</div>
          <div className="menu-items-grid">
            <button
              className="menu-action-item"
              onClick={handleOpenSearchDrawer}
            >
              <Search size={15} /> Search to Telegram (chats, numbers, groups)
            </button>
            <button
              className="menu-action-item"
              onClick={() => {
                setShowAttachMenu(false);
                setShowExcelModal(true);
              }}
            >
              <Upload size={15} /> Upload Excel
            </button>
            <button
              className="menu-action-item"
              onClick={() => {
                setShowAttachMenu(false);
                setShowPasteModal(true);
              }}
            >
              <Edit3 size={15} /> Paste numbers
            </button>
            <button className="menu-action-item" onClick={handleDownloadTemplate}>
              <Download size={15} /> Excel template
            </button>
          </div>

          <div className="menu-divider" />

          <div className="menu-section-title">ATTACH</div>
          <div className="menu-items-grid" style={{ marginBottom: 0 }}>
            <label className="menu-action-item" style={{ cursor: 'pointer' }}>
              <Image size={15} /> Photo / File
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={handleFilePicked}
                accept="image/*,.pdf,.doc,.docx"
              />
            </label>
            <button
              className="menu-action-item"
              onClick={() => {
                showToast('info', 'Voice recording available on supported devices.');
                setShowAttachMenu(false);
              }}
            >
              <Mic size={15} /> Voice
            </button>
          </div>
        </div>
      )}

      {/* Bottom Composer Bar */}
      <footer className="bottom-composer-bar">
        {/* Attachment Paperclip Button */}
        <button
          className="composer-btn-icon"
          onClick={() => setShowAttachMenu((prev) => !prev)}
          style={{ color: showAttachMenu ? '#0088cc' : undefined }}
          title="Attach files or search Telegram numbers"
        >
          <Paperclip size={20} />
        </button>

        {/* Input area container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {attachedFile && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#E0F2FE', color: '#0369A1', padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '4px', alignSelf: 'flex-start' }}>
              <Image size={12} /> {attachedFile.name}
              <X
                size={12}
                style={{ cursor: 'pointer', marginLeft: '4px' }}
                onClick={() => setAttachedFile(null)}
              />
            </div>
          )}

          <textarea
            className="composer-input-pill"
            rows={1}
            placeholder={
              selectedRecipients.length > 0
                ? `Type Telegram message to ${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''}...`
                : 'Type a Telegram personal message to send...'
            }
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendBroadcast();
              }
            }}
          />
        </div>

        {/* Send Button */}
        <button
          className="composer-btn-send"
          onClick={handleSendBroadcast}
          disabled={sending}
          style={{ background: '#0088cc' }}
          title="Send personal Telegram copy to all selected recipients"
        >
          <Send size={18} />
        </button>
      </footer>

      {/* Modals for Paste & Excel */}
      {showPasteModal && (
        <PasteNumbersModal
          onClose={() => setShowPasteModal(false)}
          onSuccess={(_count) => {
            setShowPasteModal(false);
            showToast('success', `Numbers parsed! Now select or search recipients.`);
            handleOpenSearchDrawer();
          }}
        />
      )}

      {showExcelModal && (
        <UploadExcelModal
          mode="telegram"
          onClose={() => setShowExcelModal(false)}
          onSuccess={(res) => {
            setShowExcelModal(false);
            showToast('success', `🚀 Telegram Excel Broadcast started for ${res.totalRecipients ? res.totalRecipients.toLocaleString() : 'all'} contacts!`);
            loadFeed();
          }}
        />
      )}
    </div>
  );
};
