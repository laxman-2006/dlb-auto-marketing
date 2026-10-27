import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  MessageSquare,
  Paperclip,
  Send,
  FileText,
  Search,
  Upload,
  Edit3,
  Download,
  Image,
  Mic,
  ChevronDown,
  X
} from 'lucide-react';
import { WhoGotWhatModal } from './WhoGotWhatModal';
import { PasteNumbersModal } from './PasteNumbersModal';
import { UploadExcelModal } from './UploadExcelModal';

export const PersonalMessagesView: React.FC = () => {
  const [feed, setFeed] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [activeWhoGotWhatCampId, setActiveWhoGotWhatCampId] = useState<string | null>(null);

  // Modals
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sending, setSending] = useState(false);

  const loadFeed = async () => {
    try {
      const res = await api.getCampaignsFeed();
      setFeed(res.feed || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await api.getTemplates();
      setTemplates(res.templates || []);
      const approved = res.templates?.find((t: any) => t.status === 'APPROVED');
      if (approved) setSelectedTemplateId(approved.id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadFeed();
    loadTemplates();
    const interval = setInterval(loadFeed, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendBroadcast = async () => {
    if (!messageText.trim() && !attachedFile) {
      alert('Please enter a message or attach a file.');
      return;
    }
    setSending(true);
    try {
      await api.quickSend({
        messageText: messageText.trim() || 'Photo Attachment',
        mediaName: attachedFile ? attachedFile.name : undefined,
        templateId: selectedTemplateId
      });
      setMessageText('');
      setAttachedFile(null);
      setShowAttachMenu(false);
      loadFeed();
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch broadcast');
    } finally {
      setSending(false);
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

  return (
    <div className="main-conversation-pane">
      {/* Top Header matching Screenshot 1 */}
      <header className="conversation-header">
        <div className="conv-header-avatar">
          <MessageSquare size={20} />
        </div>
        <div className="conv-header-text">
          <div className="conv-header-title">Personal Messages</div>
          <div className="conv-header-sub">One message — each person gets their own copy</div>
        </div>
      </header>

      {/* Central Feed matching Screenshot 1 */}
      <div className="campaign-feed">
        {feed.map((card) => {
          const isDone = card.status === 'COMPLETED' || card.status_label === 'Done';
          const isStopped = card.status === 'PAUSED' || card.status === 'CANCELLED' || card.status_label === 'Stopped';

          return (
            <div key={card.id} className="message-card">
              {/* If message starts with URL, display preview link */}
              {card.message_text.startsWith('http') && (
                <div className="card-link-header">
                  {card.message_text.split('\n')[0]}
                </div>
              )}

              {/* Message Content */}
              <div className="card-text-body">
                {card.message_text.startsWith('http')
                  ? card.message_text.split('\n').slice(1).join('\n').trim()
                  : card.message_text}
              </div>

              {/* Optional media attachment pill */}
              {card.media_name && (
                <div className="card-attachment-pill">
                  <Image size={13} /> {card.media_name}
                </div>
              )}

              {/* Status and Timestamp row */}
              <div className="card-meta-row">
                <div className="status-badge-pill">
                  <span className={`status-tag ${isDone ? 'done' : isStopped ? 'stopped' : 'in-progress'}`}>
                    {card.status_label}
                  </span>
                  <span style={{ fontSize: '12px', color: '#54656f', fontWeight: 600 }}>
                    {card.people_count}
                  </span>
                </div>
                <div className="card-timestamp">
                  {new Date(card.created_at).toLocaleString([], {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>

              {/* Summary line */}
              <div className="card-summary-line">
                {card.status_summary}
              </div>

              {/* Who Got What button */}
              <div>
                <button
                  className="btn-who-got-what"
                  onClick={() => setActiveWhoGotWhatCampId(card.id)}
                >
                  <ChevronDown size={14} /> Who got what
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attachment Popup Menu matching Screenshot 2 */}
      {showAttachMenu && (
        <div className="attachment-popup-menu">
          <div className="menu-section-title">NUMBERS</div>
          <div className="menu-items-grid">
            <button
              className="menu-action-item"
              onClick={() => {
                setShowAttachMenu(false);
                alert('Searching authorized WhatsApp contacts...');
              }}
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
                alert('Voice recording: Speak to record or choose an audio note.');
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
          title="Attach files or import numbers"
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
            placeholder="Type a personal message to send to each recipient..."
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
          title="Send broadcast"
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
            alert(`Ready to broadcast to ${cnt} newly pasted contacts!`);
          }}
        />
      )}

      {/* Upload Excel Modal */}
      {showExcelModal && (
        <UploadExcelModal
          onClose={() => setShowExcelModal(false)}
          onSuccess={(summary) => {
            alert(`Excel imported! ${summary.eligibleForMarketing.toLocaleString()} eligible contacts available.`);
          }}
        />
      )}

      {/* Template Selector Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Select Meta Approved Template</div>
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
