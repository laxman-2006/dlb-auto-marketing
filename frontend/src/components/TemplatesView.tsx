import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { FileText, RefreshCw, Plus, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export const TemplatesView: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // New template form
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [bodyText, setBodyText] = useState('Hello {{1}},\n\nWe are pleased to introduce our latest offerings at DLB AUTO MARKETING!\n\nReply to this message for details.');
  const [footerText, setFooterText] = useState('Reply STOP to unsubscribe');

  const loadTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data.templates || []);
      if (!selectedTemplate && data.templates?.length > 0) {
        setSelectedTemplate(data.templates[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncTemplates();
      setTemplates(res.templates || []);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !bodyText) return;
    try {
      await api.createTemplate({
        name,
        category,
        bodyText,
        footerText
      });
      setShowCreateModal(false);
      setName('');
      loadTemplates();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="card" style={{ padding: '18px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">
              <FileText size={20} color="var(--wa-green)" /> WhatsApp Message Templates
            </h2>
            <p className="card-subtitle">
              Meta WhatsApp Business Platform approved templates. Marketing messages outside the 24h window must use an approved template.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync from Meta'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> New Template
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* Templates List */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Category</th>
                  <th>Language</th>
                  <th>Meta Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedTemplate?.id === t.id ? 'var(--bg-hover)' : undefined
                    }}
                    onClick={() => setSelectedTemplate(t)}
                  >
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td>
                      <span className="badge badge-neutral">{t.category}</span>
                    </td>
                    <td>{t.language}</td>
                    <td>
                      {t.status === 'APPROVED' ? (
                        <span className="badge badge-success"><CheckCircle size={12} /> APPROVED</span>
                      ) : t.status === 'PENDING' ? (
                        <span className="badge badge-warning"><Clock size={12} /> PENDING</span>
                      ) : (
                        <span className="badge badge-danger"><AlertCircle size={12} /> REJECTED</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Interactive WhatsApp Chat Preview */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '14px' }}>
            Live WhatsApp Chat Bubble Preview
          </h3>
          {selectedTemplate ? (
            <div style={{ background: '#0b141a', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundImage: 'radial-gradient(#182229 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
              <div className="bubble outgoing" style={{ maxWidth: '100%', marginBottom: '12px' }}>
                {selectedTemplate.header_content && (
                  <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '4px' }}>
                    {selectedTemplate.header_content}
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '13.5px' }}>
                  {selectedTemplate.body_text.replace(/\{\{1\}\}/g, 'Rahul Sharma')}
                </div>
                {selectedTemplate.footer_text && (
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '6px' }}>
                    {selectedTemplate.footer_text}
                  </div>
                )}
                <div className="bubble-time">10:45 AM</div>
              </div>

              {/* Action Buttons Preview */}
              {selectedTemplate.buttons_json && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {JSON.parse(selectedTemplate.buttons_json || '[]').map((btn: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: '#202c33',
                        color: 'var(--text-link)',
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
              Select a template to preview.
            </div>
          )}
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ marginBottom: '16px' }}>Submit Template for Meta Approval</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Template Name (Lowercase & Underscores only)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. dlb_exclusive_offers"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="MARKETING">MARKETING (Offers, Announcements, Newsletters)</option>
                  <option value="UTILITY">UTILITY (Booking confirmation, Service reminders)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Message Body (Use {"{{1}}"} for Customer Name)</label>
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Footer Text (Recommended for Opt-Out info)</label>
                <input
                  type="text"
                  className="form-input"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
