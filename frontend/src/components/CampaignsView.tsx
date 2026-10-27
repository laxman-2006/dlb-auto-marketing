import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Megaphone, Plus, Pause, Play, XCircle, CheckCircle2, Clock, Eye } from 'lucide-react';

export const CampaignsView: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);

  // Wizard state
  const [step, setStep] = useState(1);
  const [campName, setCampName] = useState('');
  const [selectedTplId, setSelectedTplId] = useState('');
  const [segment, setSegment] = useState('ELIGIBLE');
  const [estimate, setEstimate] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const [cData, tData] = await Promise.all([
        api.getCampaigns(),
        api.getTemplates()
      ]);
      setCampaigns(cData.campaigns || []);
      setTemplates(tData.templates || []);
      if (!selectedTplId && tData.templates?.length > 0) {
        const approved = tData.templates.find((t: any) => t.status === 'APPROVED');
        if (approved) setSelectedTplId(approved.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenWizard = () => {
    setStep(1);
    setCampName(`DLB Campaign - ${new Date().toLocaleDateString()}`);
    setShowModal(true);
    fetchEstimate();
  };

  const fetchEstimate = async () => {
    if (!selectedTplId) return;
    try {
      const est = await api.estimateCampaign(selectedTplId, segment);
      setEstimate(est);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCampaign = async () => {
    if (!campName || !selectedTplId) return;
    setLoading(true);
    try {
      await api.createCampaign({
        name: campName,
        templateId: selectedTplId,
        contactSegment: segment
      });
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.pauseCampaign(id);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.resumeCampaign(id);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel pending messages for this campaign?')) return;
    try {
      await api.cancelCampaign(id);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewDetails = async (id: string) => {
    try {
      const details = await api.getCampaignDetails(id);
      setSelectedDetails(details);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTplId);

  return (
    <div>
      <div className="card" style={{ padding: '18px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">
              <Megaphone size={20} color="var(--wa-green)" /> WhatsApp Marketing Campaigns
            </h2>
            <p className="card-subtitle">
              Guided campaign setup with approved Meta templates, consent exclusions, durable queue, and real-time delivery tracking.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleOpenWizard}>
            <Plus size={16} /> New Campaign Wizard
          </button>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Message Template</th>
                <th>Recipients</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Status</th>
                <th>Created At</th>
                <th style={{ textAlign: 'right' }}>Controls</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No campaigns launched yet. Click "New Campaign Wizard" to start your first WhatsApp campaign!
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span className="badge badge-neutral">{c.template_name}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.total_recipients.toLocaleString()}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{c.sent_count.toLocaleString()}</td>
                    <td style={{ color: 'var(--status-green)' }}>{c.delivered_count.toLocaleString()}</td>
                    <td style={{ color: '#53bdeb' }}>{c.read_count.toLocaleString()}</td>
                    <td>
                      {c.status === 'COMPLETED' ? (
                        <span className="badge badge-success"><CheckCircle2 size={12} /> COMPLETED</span>
                      ) : c.status === 'IN_PROGRESS' ? (
                        <span className="badge badge-warning"><Clock size={12} /> IN PROGRESS</span>
                      ) : c.status === 'PAUSED' ? (
                        <span className="badge badge-warning"><Pause size={12} /> PAUSED</span>
                      ) : c.status === 'CANCELLED' ? (
                        <span className="badge badge-danger"><XCircle size={12} /> CANCELLED</span>
                      ) : (
                        <span className="badge badge-neutral">QUEUED</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginRight: '6px' }}
                        onClick={() => handleViewDetails(c.id)}
                        title="View recipient ledger"
                      >
                        <Eye size={13} />
                      </button>
                      {c.status === 'IN_PROGRESS' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginRight: '6px' }}
                          onClick={() => handlePause(c.id)}
                          title="Pause queue"
                        >
                          <Pause size={13} />
                        </button>
                      )}
                      {c.status === 'PAUSED' && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ marginRight: '6px' }}
                          onClick={() => handleResume(c.id)}
                          title="Resume queue"
                        >
                          <Play size={13} />
                        </button>
                      )}
                      {(c.status === 'QUEUED' || c.status === 'IN_PROGRESS' || c.status === 'PAUSED') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleCancel(c.id)}
                          title="Cancel pending messages"
                        >
                          <XCircle size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guided Campaign Wizard Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">
                <Megaphone size={18} color="var(--wa-green)" /> Guided Campaign Builder (Step {step} of 3)
              </span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Step 1: Campaign Name & Template */}
            {step === 1 && (
              <div>
                <div className="form-group">
                  <label className="form-label">Campaign Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={campName}
                    onChange={(e) => setCampName(e.target.value)}
                    placeholder="e.g. Diwali Vehicle Exchange Carnival"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Select Meta Approved Message Template</label>
                  <select
                    className="form-select"
                    value={selectedTplId}
                    onChange={(e) => {
                      setSelectedTplId(e.target.value);
                      fetchEstimate();
                    }}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} disabled={t.status !== 'APPROVED'}>
                        {t.name} ({t.language}) - {t.status}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTemplate && (
                  <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        TEMPLATE PREVIEW
                      </span>
                      <span className={`badge ${selectedTemplate.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>
                        {selectedTemplate.status}
                      </span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {selectedTemplate.body_text}
                    </div>
                    {selectedTemplate.footer_text && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                        {selectedTemplate.footer_text}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      fetchEstimate();
                      setStep(2);
                    }}
                    disabled={!campName || !selectedTemplate || selectedTemplate.status !== 'APPROVED'}
                  >
                    Next: Audience Selection →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Audience & Consent Enforcement */}
            {step === 2 && (
              <div>
                <div className="form-group">
                  <label className="form-label">Target Audience Segment</label>
                  <select
                    className="form-select"
                    value={segment}
                    onChange={(e) => {
                      setSegment(e.target.value);
                      fetchEstimate();
                    }}
                  >
                    <option value="ELIGIBLE">Eligible Contacts Only (Verified Affirmative Opt-In)</option>
                    <option value="ALL">All Contacts (Excludes DNC and Opted-out)</option>
                  </select>
                </div>

                {estimate && (
                  <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                    <div className="stats-grid" style={{ marginBottom: 0 }}>
                      <div className="stat-box" style={{ padding: '12px' }}>
                        <span className="stat-label">Eligible Recipients</span>
                        <span className="stat-value" style={{ fontSize: '20px', color: 'var(--wa-green)' }}>
                          {estimate.eligibleCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="stat-box" style={{ padding: '12px' }}>
                        <span className="stat-label">Estimated Meta Charges</span>
                        <span className="stat-value" style={{ fontSize: '20px' }}>
                          ₹{estimate.estimatedCostInr}
                        </span>
                        <span className="stat-sub">@ ₹0.78 / 24h conversation</span>
                      </div>
                    </div>
                  </div>
                )}

                <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Sample Personalized Message Preview:
                </h4>
                {estimate?.previews?.map((p: any, idx: number) => (
                  <div key={idx} className="bubble outgoing" style={{ alignSelf: 'flex-start', maxWidth: '100%', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>
                      To: {p.name} (+{p.phone})
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{p.renderedMessage}</div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                  <button className="btn btn-secondary" onClick={() => setStep(1)}>
                    ← Back
                  </button>
                  <button className="btn btn-primary" onClick={() => setStep(3)}>
                    Next: Review & Confirm →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Pre-Flight Review & Launch */}
            {step === 3 && (
              <div>
                <div style={{ padding: '16px', background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '15px', color: 'var(--wa-green)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={18} /> Campaign Pre-Flight Checks Passed
                  </h4>
                  <ul style={{ fontSize: '13px', color: 'var(--text-primary)', paddingLeft: '20px', lineHeight: '1.8' }}>
                    <li>Campaign: <strong>{campName}</strong></li>
                    <li>Template: <strong>{selectedTemplate?.name}</strong> (Approved by Meta)</li>
                    <li>Recipients: <strong>{estimate?.eligibleCount.toLocaleString()}</strong> eligible contacts</li>
                    <li>DNC Exclusions: Contacts with STOP / opt-out are automatically excluded</li>
                    <li>Deduplication & Idempotency: Duplicate click protection enabled</li>
                    <li>Estimated Charges: ~₹{estimate?.estimatedCostInr}</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                  <button className="btn btn-secondary" onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateCampaign}
                    disabled={loading || !estimate?.eligibleCount}
                  >
                    {loading ? 'Queueing Delivery...' : 'Confirm & Launch Campaign 🚀'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Details Modal */}
      {selectedDetails && (
        <div className="modal-overlay" onClick={() => setSelectedDetails(null)}>
          <div className="modal-content" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="card-title">{selectedDetails.campaign?.name}</span>
                <span className="card-subtitle">
                  Template: {selectedDetails.campaign?.template_name} | Recipients: {selectedDetails.recipients?.length}
                </span>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSelectedDetails(null)}
              >
                ✕
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '380px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Phone</th>
                    <th>Delivery Status</th>
                    <th>Meta WAMID</th>
                    <th>Error Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDetails.recipients?.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.customer_name}</td>
                      <td style={{ fontFamily: 'monospace' }}>+{r.phone_number}</td>
                      <td>
                        {r.status === 'READ' ? (
                          <span className="badge badge-success">READ</span>
                        ) : r.status === 'DELIVERED' ? (
                          <span className="badge badge-success">DELIVERED</span>
                        ) : r.status === 'SENT' || r.status === 'ACCEPTED' ? (
                          <span className="badge badge-neutral">{r.status}</span>
                        ) : r.status === 'FAILED' ? (
                          <span className="badge badge-danger">FAILED</span>
                        ) : (
                          <span className="badge badge-warning">{r.status}</span>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.message_id ? `${r.message_id.slice(0, 16)}...` : '-'}
                      </td>
                      <td style={{ fontSize: '11px', color: '#f87171' }}>{r.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
