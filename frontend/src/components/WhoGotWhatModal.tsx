import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, Download, RotateCw, CheckCircle2, Clock, AlertCircle, X } from 'lucide-react';

interface Props {
  campaignId: string;
  onClose: () => void;
}

export const WhoGotWhatModal: React.FC<Props> = ({ campaignId, onClose }) => {
  const [data, setData] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await api.getWhoGotWhat(campaignId, statusFilter, searchTerm, page);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [campaignId, statusFilter, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadReport();
  };

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const res = await api.retryFailedRecipients(campaignId);
      alert(`Retrying ${res.retriedCount} temporary failed recipients.`);
      loadReport();
    } catch (err: any) {
      alert(err.message || 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const campaign = data?.campaign;
  const recipients = data?.recipients || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '900px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">Who Got What — Recipient Delivery Report</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Campaign: <strong>{campaign?.name || 'Personal Message'}</strong> • Total Recipients: <strong>{data?.total?.toLocaleString() || 0}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Action Controls & Filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '220px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by name or number..."
                className="search-input"
                style={{ paddingLeft: '32px', backgroundColor: '#f0f2f5', borderRadius: 'var(--radius-full)', padding: '7px 12px 7px 32px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-bizz-secondary" style={{ padding: '6px 14px', fontSize: '12.5px' }}>
              Search
            </button>
          </form>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-bizz-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
              onClick={handleRetryFailed}
              disabled={retrying}
            >
              <RotateCw size={13} className={retrying ? 'spin' : ''} /> Retry Failed
            </button>
            <a
              href="/api/reports/export"
              className="btn-bizz-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', textDecoration: 'none' }}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={13} /> Export CSV
            </a>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['ALL', 'READ', 'DELIVERED', 'SENT', 'QUEUED', 'FAILED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '11.5px',
                fontWeight: 600,
                border: '1px solid',
                cursor: 'pointer',
                backgroundColor: statusFilter === st ? '#008069' : '#ffffff',
                color: statusFilter === st ? '#ffffff' : '#54656f',
                borderColor: statusFilter === st ? '#008069' : '#d1d7db'
              }}
              onClick={() => { setStatusFilter(st); setPage(1); }}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Recipients Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--wa-border)', borderRadius: 'var(--radius-md)', maxHeight: '400px' }}>
          <table className="bizz-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                <th>Status</th>
                <th>Provider Message ID (WAMID)</th>
                <th>Sent Time</th>
                <th>Delivered Time</th>
                <th>Failure Reason</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    {loading ? 'Loading report...' : 'No recipient records found for this filter.'}
                  </td>
                </tr>
              ) : (
                recipients.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.customer_name || 'Customer'}</td>
                    <td style={{ fontFamily: 'monospace', color: '#008069' }}>+{r.phone_number}</td>
                    <td>
                      {r.status === 'READ' ? (
                        <span className="status-tag done" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={11} /> READ
                        </span>
                      ) : r.status === 'DELIVERED' ? (
                        <span className="status-tag done" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={11} /> DELIVERED
                        </span>
                      ) : r.status === 'SENT' || r.status === 'ACCEPTED' ? (
                        <span className="status-tag in-progress" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} /> SENT
                        </span>
                      ) : r.status === 'FAILED' ? (
                        <span className="status-tag" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={11} /> FAILED
                        </span>
                      ) : (
                        <span className="status-tag stopped">{r.status}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {r.message_id ? `${r.message_id.slice(0, 18)}...` : '-'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {r.sent_at ? new Date(r.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td style={{ fontSize: '11.5px', color: '#dc2626' }}>
                      {r.error_message || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          <span>Page {page} of {data?.totalPages || 1}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn-bizz-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="btn-bizz-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              disabled={page >= (data?.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
