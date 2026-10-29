import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import {
  MessageSquare,
  Search,
  Upload,
  Edit3,
  Download,
  Image,
  Mic,
  Paperclip,
  FileText,
  Send,
  ChevronDown,
  X,
  User,
  Plus,
  Check,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { WhoGotWhatModal } from './WhoGotWhatModal';
import { PasteNumbersModal } from './PasteNumbersModal';
import { UploadExcelModal } from './UploadExcelModal';
import { CampaignProgressCard } from './CampaignProgressCard';

interface ContactItem {
  id: string;
  name: string;
  phone: string;
  tag?: string;
}

interface PersonalMessagesViewProps {
  onNavigateSettings?: () => void;
}

export const PersonalMessagesView: React.FC<PersonalMessagesViewProps> = ({ onNavigateSettings }) => {
  const [feed, setFeed] = useState<any[]>([]);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  // WhatsApp connection status
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [connectedNumber, setConnectedNumber] = useState('');

  // Anti-Ban Safe Pacing Telemetry
  const [pacingStatus, setPacingStatus] = useState<any>(null);

  // Search WhatsApp Drawer matching Screenshot 2
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactItem[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<ContactItem[]>([]);

  // Modals & Popups
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [activeWhoGotWhatCampId, setActiveWhoGotWhatCampId] = useState<string | null>(null);

  // Inline feedback toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStatus = async () => {
    try {
      const st = await api.getWhatsAppStatus();
      setWhatsappConnected(st.connected === true || st.state === 'CONNECTED');
      if (st.displayPhoneNumber) setConnectedNumber(st.displayPhoneNumber);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPacing = async () => {
    try {
      const res = await api.getPacingStatus();
      if (res?.success && res?.pacing) {
        setPacingStatus(res.pacing);
      }
    } catch {}
  };

  const loadFeed = async () => {
    try {
      const data = await api.getCampaignsFeed();
      setFeed(data.feed || []);
    } catch (err) {
      console.error('Failed to load campaign feed:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data.templates || []);
      const approved = (data.templates || []).find((t: any) => t.status === 'APPROVED');
      if (approved) setSelectedTemplateId(approved.id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadFeed();
    loadTemplates();
    loadStatus();
    loadPacing();
    const interval = setInterval(() => {
      loadFeed();
      loadPacing();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Search contacts as user types matching Screenshot 2
  useEffect(() => {
    if (!showSearchDrawer) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await api.getContacts(1, 20, 'all', searchQuery.trim());
        const mapped: ContactItem[] = (res.contacts || []).map((c: any) => ({
          id: c.id,
          name: c.name || 'Valued Customer',
          phone: c.normalized_phone || c.raw_phone,
          tag: c.id === 'laxman_admin_contact' ? 'User & Access' : (c.consent_status === 'OPTED_IN' ? 'Customer' : 'Contact')
        }));

        // If user typed numbers and no exact match, add synthetic option
        const rawDigits = searchQuery.replace(/[^\d]/g, '');
        if (rawDigits.length >= 5) {
          const formatted = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;
          const alreadyInList = mapped.some((m) => m.phone.replace(/[^\d]/g, '').includes(rawDigits));
          if (!alreadyInList) {
            mapped.unshift({
              id: `custom_${rawDigits}`,
              name: `+${formatted}`,
              phone: formatted,
              tag: 'New Number'
            });
          }
        }

        setSearchResults(mapped);
      } catch (err) {
        console.error('Contact search error:', err);
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

  const handleToggleRecipient = (contact: ContactItem) => {
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
      const res = await api.quickSend({
        messageText: messageText.trim() || 'Photo Attachment',
        mediaName: attachedFile ? attachedFile.name : undefined,
        recipientPhones,
        templateId: selectedTemplateId
      });

      if (res && res.id) {
        setSelectedCampId(res.id);
      }

      setMessageText('');
      setAttachedFile(null);
      setSelectedRecipients([]);
      setShowSearchDrawer(false);
      showToast('success', `Message sent to ${recipientPhones.length} recipient${recipientPhones.length > 1 ? 's' : ''}!`);
      await loadFeed();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to dispatch message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!window.confirm('क्या आप इस WhatsApp मैसेज सेट/बैच को हटाना चाहते हैं?')) return;
    try {
      await api.deleteCampaign(id);
      showToast('success', 'WhatsApp मैसेज बैच हटाया गया!');
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

  const handleSelectTemplate = (tpl: any) => {
    setSelectedTemplateId(tpl.id);
    setMessageText(tpl.body_text);
    setShowTemplateModal(false);
  };

  // Section 5: Real campaign metrics for selected or latest batch
  const activeCamp = (selectedCampId ? feed.find((c) => c.id === selectedCampId) : null) || (feed.length > 0 ? feed[0] : null);
  const totalEligible = activeCamp ? (activeCamp.total_recipients || 1) : 0;
  const deliveredCount = activeCamp ? (activeCamp.delivered_count || activeCamp.sent_count || 0) : 0;
  const failedCount = activeCamp ? (activeCamp.failed_count || 0) : 0;
  const pendingCount = Math.max(0, totalEligible - (deliveredCount + failedCount));
  const readCount = activeCamp?.read_count || 0;

  return (
    <div className="main-conversation-pane">
      {/* Top Header */}
      <header className="conversation-header">
        <div className="conv-header-avatar">
          <MessageSquare size={20} />
        </div>
        <div className="conv-header-text">
          <div className="conv-header-title">
            Personal Messages
            {whatsappConnected ? (
              <span className="status-tag done" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span className="metrics-live-dot" style={{ width: 6, height: 6 }} />
                Live WhatsApp {connectedNumber ? `(+${connectedNumber.replace(/[^\d]/g, '')})` : 'Connected'}
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
                title="Click to scan QR code in Settings"
              >
                🔴 Disconnected — Scan QR Code
              </span>
            )}
          </div>
          <div className="conv-header-sub">One message — each recipient receives their own direct copy</div>
        </div>
      </header>

      {/* Disconnected Alert Banner */}
      {!whatsappConnected && (
        <div
          onClick={onNavigateSettings}
          style={{
            margin: '14px 28px 0',
            padding: '12px 18px',
            background: '#FEF2F2',
            border: '1.5px solid #FCA5A5',
            borderRadius: '10px',
            color: '#991B1B',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(220, 38, 38, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>
              <strong>WhatsApp डिस्कनेक्ट है:</strong> नया WhatsApp नंबर कनेक्ट करने के लिए यहाँ क्लिक करें और QR कोड स्कैन करें।
            </span>
          </div>
          <span style={{ background: '#DC2626', color: '#ffffff', padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
            QR कोड स्कैन करें →
          </span>
        </div>
      )}

      {/* Live WhatsApp Anti-Ban Safe Speed Status Card */}
      <div style={{
        margin: '12px 28px 0',
        padding: '12px 18px',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #e6f7ef 100%)',
        border: '1.5px solid #86efac',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🛡️</span>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                WhatsApp Anti-Ban Safe Mode Active
                <span style={{ fontSize: '11px', background: '#16a34a', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                  10–15 msgs/hour
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#15803d' }}>
                Human-randomized delays (2m, 3m, 5m, 10m) • Running 24/7 continuously without WhatsApp ban risk
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#ffffff', padding: '6px 14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>THIS HOUR</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#166534' }}>
                {pacingStatus?.sentLastHour ?? 0} <span style={{ fontSize: '11px', color: '#94a3b8' }}>/ 15 max</span>
              </div>
            </div>
            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>NEXT DISPATCH</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f766e' }}>
                {pacingStatus?.isDispatching 
                  ? '⚡ Sending now' 
                  : (pacingStatus?.nextSendInSeconds > 0 
                      ? `${Math.floor(pacingStatus.nextSendInSeconds / 60)}m ${pacingStatus.nextSendInSeconds % 60}s` 
                      : 'Ready')}
              </div>
            </div>
            {pacingStatus?.totalQueued > 0 && (
              <>
                <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>QUEUED</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0369a1' }}>
                    {pacingStatus.totalQueued.toLocaleString()}
                  </div>
                </div>
                <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>EST. TIME</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#4338ca' }}>
                    ~{pacingStatus.estimatedDaysRemaining} days
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ fontSize: '11.5px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px dashed #bbf7d0', paddingTop: '6px' }}>
          <span>👤 <strong>Smart Greeting Active:</strong> समय व नाम अनुसार (Good morning / afternoon / evening [Name] जी) स्वतः जुड़कर जाता है।</span>
        </div>
      </div>

      {/* SECTION 5: Campaign Progress Display for Selected or Latest Batch */}
      {activeCamp && (
        <CampaignProgressCard
          campaignId={activeCamp.id}
          campaignName={activeCamp.name || 'Active Campaign'}
          status={activeCamp.status_label || activeCamp.status || 'Active'}
          totalRecipients={totalEligible}
          delivered={deliveredCount}
          pending={pendingCount}
          failed={failedCount}
          readCount={readCount}
          onRetryFailed={() => {
            loadFeed();
            showToast('success', 'Retrying failed messages...');
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
            backgroundColor: toastMessage.type === 'success' ? '#166534' : toastMessage.type === 'error' ? '#991b1b' : '#0f172a',
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
          const isDone = card.status === 'COMPLETED' || card.status_label === 'Done';
          const isStopped = card.status === 'STOPPED' || card.status_label === 'Stopped';
          const count = card.total_count || card.total_recipients || 1;
          const msg = card.message_snippet || card.message_text || 'Marketing message';
          const cardSent = card.sent_count || 0;
          const cardFailed = card.failed_count || 0;
          const cardPending = Math.max(0, count - (cardSent + cardFailed));

          return (
            <div
              key={card.id}
              className={`campaign-bubble-card ${isSelected ? 'active-set' : ''}`}
              onClick={() => setSelectedCampId(card.id)}
              title="इस WhatsApp सेट का विवरण देखने के लिए क्लिक करें"
            >
              <div className="bubble-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="bubble-campaign-name">{card.name || 'WhatsApp Blast'}</span>
                  {isSelected && (
                    <span className="active-set-badge">
                      <CheckCircle2 size={11} /> चयनित सेट (Active)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`status-tag ${isDone ? 'done' : isStopped ? 'stopped' : 'in-progress'}`}>
                    {card.status_label || card.status}
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

              <div className="card-message-content">{msg}</div>

              {/* Mini Stats Bar for this WhatsApp Batch */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap', fontSize: '11.5px', fontWeight: 600 }}>
                <span style={{ color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                  कुल: {count}
                </span>
                <span style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                  सफल: {cardSent}
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

              <div className="card-summary-line" style={{ marginTop: '8px' }}>
                <span style={{ color: '#4b5563' }}>{card.summary_line}</span>
                <span className="card-timestamp" style={{ marginLeft: 'auto' }}>
                  {card.created_time}
                </span>
              </div>

              {/* Who Got What button */}
              <div style={{ marginTop: '6px' }}>
                <button
                  className="btn-who-got-what"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveWhoGotWhatCampId(card.id);
                  }}
                >
                  <ChevronDown size={14} /> Who got what (विस्तार से देखें)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SEARCH WHATSAPP DRAWER - Exactly matching Screenshot 2 */}
      {showSearchDrawer && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderTop: '1px solid var(--dlb-border)',
            borderBottom: '1px solid var(--dlb-border)',
            padding: '14px 20px 18px 20px',
            boxShadow: '0 4px 12px rgba(16,42,67,0.06)',
            zIndex: 20
          }}
        >
          {/* Search Input Box with Done button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--dlb-ice-blue)',
                border: '1.5px solid var(--dlb-blue-royal)',
                borderRadius: '8px',
                padding: '8px 16px',
                gap: '10px'
              }}
            >
              <Search size={18} color="var(--dlb-blue-royal)" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search WhatsApp (chats, numbers, groups)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '14px',
                  color: 'var(--dlb-text-primary)',
                  backgroundColor: 'transparent'
                }}
              />
              {searchQuery && (
                <X
                  size={16}
                  color="var(--dlb-text-muted)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSearchQuery('')}
                />
              )}
            </div>

            <button
              onClick={() => setShowSearchDrawer(false)}
              style={{
                background: 'linear-gradient(135deg, var(--dlb-navy-primary) 0%, var(--dlb-blue-royal) 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 22px',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(16,42,67,0.2)'
              }}
            >
              Done
            </button>
          </div>

          {/* Connection Status notice matching Screenshot 2 */}
          <div
            style={{
              fontSize: '12.5px',
              color: 'var(--dlb-text-secondary)',
              backgroundColor: 'var(--dlb-ice-blue)',
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--dlb-border)',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>
              {whatsappConnected
                ? `✓ WhatsApp is connected (${connectedNumber || 'Active'}). Live contact search enabled.`
                : 'WhatsApp is not linked, so its groups are not shown yet.'}
            </span>
            {!whatsappConnected && onNavigateSettings && (
              <button
                onClick={onNavigateSettings}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--dlb-blue-royal)',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--dlb-blue-royal)'
                }}
              >
                Link WhatsApp
              </button>
            )}
          </div>

          {/* Search Results List */}
          <div
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e5e2da',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
          >
            {searchResults.length > 0 ? (
              searchResults.map((item) => {
                const isSelected = selectedRecipients.some((r) => r.phone === item.phone);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleRecipient(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderBottom: '1px solid #f0eee6',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                      transition: 'background-color 0.1s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: '#e9ecef',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#54656f'
                        }}
                      >
                        <User size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111b21' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#667781' }}>
                          +{item.phone.replace(/[^\d]/g, '')} {item.tag ? `· ${item.tag}` : ''}
                        </div>
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
                        backgroundColor: isSelected ? '#008069' : '#f0f2f5',
                        color: isSelected ? '#ffffff' : '#54656f'
                      }}
                    >
                      {isSelected ? <Check size={16} /> : <Plus size={16} />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: '#667781' }}>
                {searchQuery ? `No contacts matching "${searchQuery}"` : 'Type a name or phone number to search...'}
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
            borderTop: '1px solid #e2ded5',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#54656f' }}>To:</span>
          {selectedRecipients.map((r) => (
            <span
              key={r.phone}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#e8f5e9',
                color: '#1b5e20',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              <User size={12} /> {r.name} (+{r.phone.replace(/[^\d]/g, '')})
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
              color: '#008069',
              fontSize: '12px',
              fontWeight: 600,
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
              color: '#8696a0',
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
        <div className="attachment-popup-menu">
          <div className="menu-section-title">NUMBERS</div>
          <div className="menu-items-grid">
            <button
              className="menu-action-item"
              onClick={handleOpenSearchDrawer}
            >
              <Search size={15} /> Search WhatsApp (chats, numbers, groups)
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
                showToast('info', 'Voice recording available on supported mobile browsers.');
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
          style={{ color: showAttachMenu ? '#008069' : undefined }}
          title="Attach files or search numbers"
        >
          <Paperclip size={20} />
        </button>

        {/* Input area container */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {attachedFile && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e7f4eb', color: '#1f6e43', padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '4px', alignSelf: 'flex-start' }}>
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
                ? `Type message to ${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''}...`
                : 'Type a personal message to send...'
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

        {/* Document/Template Selector Button */}
        <button
          className="composer-btn-icon"
          onClick={() => setShowTemplateModal(true)}
          title="Select approved template"
        >
          <FileText size={20} />
        </button>

        {/* Send Button */}
        <button
          className="composer-send-btn"
          onClick={handleSendBroadcast}
          disabled={sending || (!messageText.trim() && !attachedFile)}
          title="Send message"
        >
          <Send size={18} />
        </button>
      </footer>

      {/* Who Got What Modal */}
      {activeWhoGotWhatCampId && (
        <WhoGotWhatModal
          campaignId={activeWhoGotWhatCampId}
          onClose={() => setActiveWhoGotWhatCampId(null)}
        />
      )}

      {/* Paste Numbers Modal */}
      {showPasteModal && (
        <PasteNumbersModal
          onClose={() => setShowPasteModal(false)}
          onSuccess={(cnt) => {
            showToast('success', `Ready to broadcast to ${cnt} newly pasted contacts!`);
          }}
        />
      )}

      {/* Upload Excel Modal */}
      {showExcelModal && (
        <UploadExcelModal
          mode="whatsapp"
          onClose={() => setShowExcelModal(false)}
          onSuccess={(res) => {
            showToast('success', `🚀 WhatsApp Excel Broadcast started for ${res.totalRecipients ? res.totalRecipients.toLocaleString() : 'all'} contacts!`);
            loadFeed();
          }}
        />
      )}

      {/* Template Selector Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Select Message Template</div>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: '12px',
                    border: '1px solid #e9edef',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    background: selectedTemplateId === t.id ? '#f0faf4' : '#ffffff'
                  }}
                  onClick={() => handleSelectTemplate(t)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</span>
                    <span className="status-tag done">{t.status}</span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#54656f', whiteSpace: 'pre-wrap' }}>
                    {t.body_text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
