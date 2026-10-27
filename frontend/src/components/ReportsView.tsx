import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { BarChart3, Download, RefreshCw } from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.getReportsOverview();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const metrics = data?.metrics || {
    totalRecipients: 0,
    queued: 0,
    accepted: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    cancelled: 0,
    optOuts: 0,
    deliveryRate: '0.0%',
    readRate: '0.0%',
    estimatedCharges: '₹0.00'
  };

  return (
    <div>
      <div className="card" style={{ padding: '18px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">
              <BarChart3 size={20} color="var(--wa-green)" /> Marketing Reports & Provider Analytics
            </h2>
            <p className="card-subtitle">
              Authentic provider-confirmed metrics, webhook event logs, and Meta messaging charge reconciliation.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={loadReports} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <a href="/api/reports/export" className="btn btn-primary" target="_blank" rel="noreferrer">
              <Download size={16} /> Export to CSV
            </a>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">Total Recipients</span>
          <span className="stat-value">{metrics.totalRecipients.toLocaleString()}</span>
          <span className="stat-sub">Across all campaigns</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Accepted by Provider</span>
          <span className="stat-value" style={{ color: 'var(--wa-green)' }}>
            {metrics.accepted.toLocaleString()}
          </span>
          <span className="stat-sub">Validated by WhatsApp API</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Delivered Messages</span>
          <span className="stat-value" style={{ color: 'var(--status-green)' }}>
            {metrics.delivered.toLocaleString()}
          </span>
          <span className="stat-sub">Provider webhook confirmed</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Read Messages</span>
          <span className="stat-value" style={{ color: '#53bdeb' }}>
            {metrics.read.toLocaleString()}
          </span>
          <span className="stat-sub">Read receipts received</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Delivery Rate</span>
          <span className="stat-value" style={{ color: 'var(--status-green)' }}>
            {metrics.deliveryRate}
          </span>
          <span className="stat-sub">Delivered / Sent</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Read Rate</span>
          <span className="stat-value" style={{ color: '#53bdeb' }}>
            {metrics.readRate}
          </span>
          <span className="stat-sub">Read / Delivered</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Opt-Out Requests</span>
          <span className="stat-value" style={{ color: 'var(--status-red)' }}>
            {metrics.optOuts.toLocaleString()}
          </span>
          <span className="stat-sub">Contacts sent STOP</span>
        </div>
        <div className="stat-box" style={{ borderColor: 'var(--wa-green)' }}>
          <span className="stat-label">Estimated Charges</span>
          <span className="stat-value" style={{ color: 'var(--wa-green)' }}>
            {metrics.estimatedCharges}
          </span>
          <span className="stat-sub">Meta marketing rates</span>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', margin: 0 }}>
          <span className="card-title">Campaign Performance Breakdown</span>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Status</th>
                <th>Selected</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Failed</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {!data?.campaignBreakdown || data.campaignBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No campaigns recorded yet.
                  </td>
                </tr>
              ) : (
                data.campaignBreakdown.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span className="badge badge-neutral">{c.status}</span>
                    </td>
                    <td>{c.total_recipients.toLocaleString()}</td>
                    <td>{c.sent_count.toLocaleString()}</td>
                    <td style={{ color: 'var(--status-green)' }}>{c.delivered_count.toLocaleString()}</td>
                    <td style={{ color: '#53bdeb' }}>{c.read_count.toLocaleString()}</td>
                    <td style={{ color: 'var(--status-red)' }}>{c.failed_count.toLocaleString()}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
