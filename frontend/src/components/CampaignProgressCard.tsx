import React from 'react';
import { Users, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface CampaignProgressCardProps {
  totalRecipients: number;
  delivered: number;
  pending: number;
  failed: number;
  readCount?: number;
  status?: string;
  campaignName?: string;
}

export const CampaignProgressCard: React.FC<CampaignProgressCardProps> = ({
  totalRecipients,
  delivered,
  pending,
  failed,
  readCount = 0,
  status = 'ACTIVE',
  campaignName = 'Live Campaign'
}) => {
  const safeTotal = Math.max(0, totalRecipients);
  const safeDelivered = Math.max(0, delivered);
  const safePending = Math.max(0, pending);
  const safeFailed = Math.max(0, failed);

  // Delivery percentage based on accurate real numbers
  const percentComplete = safeTotal > 0 ? Math.min(100, Math.round(((safeDelivered + safeFailed) / safeTotal) * 100)) : 0;
  const percentDelivered = safeTotal > 0 ? Math.min(100, Math.round((safeDelivered / safeTotal) * 100)) : 0;

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
    </div>
  );
};
