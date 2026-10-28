import React, { useState } from 'react';
import { Users, CheckCircle2, Clock, AlertTriangle, RotateCw } from 'lucide-react';
import { api } from '../api';

interface CampaignProgressCardProps {
  campaignId?: string;
  totalRecipients: number;
  delivered: number;
  pending: number;
  failed: number;
  readCount?: number;
  status?: string;
  campaignName?: string;
  onRetryFailed?: () => void;
}

export const CampaignProgressCard: React.FC<CampaignProgressCardProps> = ({
  campaignId,
  totalRecipients,
  delivered,
  pending: propPending,
  failed,
  readCount = 0,
  status = 'ACTIVE',
  campaignName = 'Live Campaign',
  onRetryFailed
}) => {
  const [retrying, setRetrying] = useState(false);

  const safeTotal = Math.max(0, totalRecipients);
  // Delivered can never exceed total recipients
  const safeDelivered = Math.min(safeTotal, Math.max(0, delivered));
  const safeFailed = Math.max(0, failed);
  const safePending = propPending !== undefined ? propPending : Math.max(0, safeTotal - (safeDelivered + safeFailed));

  // Delivery percentage based on accurate real numbers
  const percentComplete = safeTotal > 0 ? Math.min(100, Math.round(((safeDelivered + safeFailed) / safeTotal) * 100)) : 0;
  const percentDelivered = safeTotal > 0 ? Math.min(100, Math.round((safeDelivered / safeTotal) * 100)) : 0;

  const handleRetry = async () => {
    if (!campaignId) return;
    setRetrying(true);
    try {
      await api.retryFailedRecipients(campaignId);
      if (onRetryFailed) {
        onRetryFailed();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to retry failed recipients');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="campaign-metrics-card">
      <div className="metrics-card-header">
        <div className="metrics-header-left">
          <div className="metrics-live-dot" />
          <span className="metrics-card-title">{campaignName}</span>
          <span className={`status-pill ${status.toLowerCase()}`}>
            {status}
          </span>
        </div>
        <div className="metrics-header-right">
          <span className="metrics-percent-text">{percentComplete}% Processed</span>
        </div>
      </div>

      {/* Smooth Progress Bar */}
      <div className="metrics-progress-track">
        <div
          className="metrics-progress-delivered"
          style={{ width: `${percentDelivered}%` }}
          title={`Delivered: ${safeDelivered}`}
        />
        {safeFailed > 0 && (
          <div
            className="metrics-progress-failed"
            style={{ width: `${safeTotal > 0 ? (safeFailed / safeTotal) * 100 : 0}%` }}
            title={`Failed: ${safeFailed}`}
          />
        )}
      </div>

      {/* 4 Primary Metric Stat Blocks */}
      <div className="metrics-stat-grid">
        {/* TOTAL RECIPIENTS */}
        <div className="stat-card">
          <div className="stat-card-icon icon-total">
            <Users size={16} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">TOTAL RECIPIENTS</span>
            <span className="stat-card-value">{safeTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* DELIVERED */}
        <div className="stat-card">
          <div className="stat-card-icon icon-delivered">
            <CheckCircle2 size={16} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">DELIVERED</span>
            <span className="stat-card-value stat-delivered">{safeDelivered.toLocaleString()}</span>
            {readCount > 0 && (
              <span className="stat-subtext">{readCount.toLocaleString()} read</span>
            )}
          </div>
        </div>

        {/* PENDING */}
        <div className="stat-card">
          <div className="stat-card-icon icon-pending">
            <Clock size={16} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">PENDING</span>
            <span className="stat-card-value stat-pending">{safePending.toLocaleString()}</span>
          </div>
        </div>

        {/* FAILED */}
        <div className="stat-card">
          <div className="stat-card-icon icon-failed">
            <AlertTriangle size={16} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">FAILED</span>
            <span className="stat-card-value stat-failed">{safeFailed.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Failed Retry Option (Only appears if there are failed contacts) */}
      {safeFailed > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '12.5px',
            color: '#991B1B',
            marginTop: '4px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} color="#DC2626" />
            <span>
              <strong>{safeFailed.toLocaleString()} contact{safeFailed > 1 ? 's' : ''} failed</strong> (e.g. number not registered on WhatsApp).
            </span>
          </div>
          {campaignId && onRetryFailed && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RotateCw size={12} className={retrying ? 'spin' : ''} />
              {retrying ? 'Retrying...' : 'Retry Failed Only (दुबारा भेजें)'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
