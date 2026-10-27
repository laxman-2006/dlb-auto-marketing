import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Phone, User, Building, RefreshCw, Key, CheckCircle, AlertTriangle, XCircle, Send, Copy, ShieldCheck } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [status, setStatus] = useState<any | null>(null);
  const [phoneNum, setPhoneNum] = useState('+91 98765 00000');
  const [verifying, setVerifying] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);

  // Meta Cloud API details
  const [wabaId, setWabaId] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [token, setToken] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setStatus(data);
      if (data.displayPhoneNumber) setPhoneNum(data.displayPhoneNumber);
      if (data.wabaId) setWabaId(data.wabaId);
      if (data.phoneNumberId) setPhoneId(data.phoneNumberId);
    } catch (err: any) {
      console.error(err);
      setBannerMessage({ type: 'error', text: `Failed to load WhatsApp status: ${err.message}` });
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleVerify = async () => {
    setVerifying(true);
    setBannerMessage(null);
    try {
      const result = await api.verifyWhatsApp();
      await loadStatus();
      if (result.connected) {
        setBannerMessage({ type: 'success', text: `WhatsApp Business connected successfully! Messaging Tier: ${result.messagingTier || 'TIER_1K'}` });
      } else if (result.state === 'ACTION_REQUIRED') {
        setBannerMessage({ type: 'warning', text: result.errorDetail || 'Action Required: Incomplete Meta credentials or authorization.' });
      } else {
        setBannerMessage({ type: 'error', text: result.errorDetail || `Connection status: ${result.state}` });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Verification diagnostic check failed.' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setBannerMessage(null);
    try {
      const res = await api.connectWhatsApp({
        wabaId,
        phoneNumberId: phoneId,
        systemUserToken: token,
        displayPhoneNumber: phoneNum
      });
      await loadStatus();
      if (res.success) {
        setBannerMessage({ type: 'success', text: 'WhatsApp Business credentials verified and connected successfully!' });
      } else {
        setBannerMessage({
          type: 'warning',
          text: res.status?.errorDetail || 'Credentials saved, but Meta verification requires action.'
        });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to update credentials' });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp Business Account from DLB AUTO MARKETING?')) return;
    try {
      await api.disconnectWhatsApp();
      await loadStatus();
      setBannerMessage({ type: 'info', text: 'WhatsApp account disconnected.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) {
      setBannerMessage({ type: 'warning', text: 'Enter a valid recipient phone number (with country code) for the test message.' });
      return;
    }
    setTestSending(true);
    setBannerMessage(null);
    try {
      const res = await api.sendTestMessage(testRecipient);
      if (res.success) {
        setBannerMessage({ type: 'success', text: `Test message dispatched! WAMID: ${res.wamid}` });
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Failed to send test message' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Test message failed' });
    } finally {
      setTestSending(false);
    }
  };

  const copyWebhookUrl = () => {
    const fullUrl = `${window.location.origin}/webhook`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const currentState = status?.state || 'NOT_CONNECTED';
  const isConnected = status?.connected === true && currentState === 'CONNECTED';

  const getStatusBadgeClass = () => {
    switch (currentState) {
      case 'CONNECTED':
        return 'status-tag done';
      case 'CONNECTING':
        return 'status-tag in-progress';
      case 'ACTION_REQUIRED':
        return 'status-tag action-required';
      case 'CONNECTION_ERROR':
      case 'CONFIG_ERROR':
      case 'AUTH_EXPIRED':
        return 'status-tag connection-error';
      default:
        return 'status-tag stopped';
    }
  };

  return (
    <div className="settings-page-container">
      <h1 className="settings-heading">Settings</h1>

      {/* Inline Feedback Banner (No Alert Modals) */}
      {bannerMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor:
              bannerMessage.type === 'success'
                ? '#ecfdf5'
                : bannerMessage.type === 'warning'
                ? '#fffbeb'
                : bannerMessage.type === 'error'
                ? '#fef2f2'
                : '#f0f9ff',
            color:
              bannerMessage.type === 'success'
                ? '#065f46'
                : bannerMessage.type === 'warning'
                ? '#92400e'
                : bannerMessage.type === 'error'
                ? '#991b1b'
                : '#075985',
            border: `1px solid ${
              bannerMessage.type === 'success'
                ? '#a7f3d0'
                : bannerMessage.type === 'warning'
                ? '#fde68a'
                : bannerMessage.type === 'error'
                ? '#fecaca'
                : '#bae6fd'
            }`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {bannerMessage.type === 'success' && <CheckCircle size={16} />}
            {bannerMessage.type === 'warning' && <AlertTriangle size={16} />}
            {bannerMessage.type === 'error' && <XCircle size={16} />}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}

      {/* SECTION 1: MY WHATSAPP (FOR FORWARD) */}
      <div className="settings-section-title">MY WHATSAPP (FOR FORWARD)</div>
      <div className="settings-white-card">
        {/* Header row with Link your WhatsApp */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Phone size={18} color="#111b21" />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111b21' }}>WhatsApp Business Integration</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={getStatusBadgeClass()}>
              {currentState}
            </span>
            <button
              className="btn-bizz-secondary"
              style={{ padding: '5px 12px', fontSize: '12.5px' }}
              onClick={handleVerify}
              disabled={verifying}
            >
              <RefreshCw size={12} className={verifying ? 'spin' : ''} /> Verify Connection
            </button>
            {isConnected && (
              <button
                className="btn-bizz-secondary"
                style={{ padding: '5px 12px', fontSize: '12.5px', color: '#b91c1c' }}
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Sender display phone number */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Sender Display Phone Number
          </label>
          <input
            type="text"
            className="composer-input-pill"
            style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', border: '1px solid #d1d7db', backgroundColor: '#ffffff' }}
            placeholder="e.g. +91 98765 00000"
            value={phoneNum}
            onChange={(e) => setPhoneNum(e.target.value)}
          />
        </div>

        {/* Diagnostic Checklist & Connection Status Information */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <ShieldCheck size={18} color="#008069" />
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>
              Connection Diagnostics & Coexistence Guidance
            </span>
          </div>

          <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5, marginBottom: '12px' }}>
            DLB AUTO MARKETING integrates directly with the <strong>Meta WhatsApp Business Platform (Cloud API)</strong>.
            If your number is registered in the <strong>WhatsApp Business mobile app</strong>, Meta provides
            <em> Coexistence Onboarding</em> allowing this application to send approved marketing campaigns while your team continues handling personal 1:1 customer chats on mobile.
          </p>

          {/* Checklist Items */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {status?.diagnostics?.wabaConfigured ? <CheckCircle size={15} color="#059669" /> : <AlertTriangle size={15} color="#d97706" />}
              <span>WABA ID: <strong>{status?.diagnostics?.wabaConfigured ? 'Configured' : 'Missing / Placeholder'}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {status?.diagnostics?.phoneIdConfigured ? <CheckCircle size={15} color="#059669" /> : <AlertTriangle size={15} color="#d97706" />}
              <span>Phone ID: <strong>{status?.diagnostics?.phoneIdConfigured ? 'Configured' : 'Missing / Placeholder'}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {status?.hasTokenConfigured ? <CheckCircle size={15} color="#059669" /> : <AlertTriangle size={15} color="#d97706" />}
              <span>System Token: <strong>{status?.hasTokenConfigured ? 'Configured' : 'Missing'}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle size={15} color="#059669" />
              <span>Storage: <strong>Persistent SQLite (WAL)</strong></span>
            </div>
          </div>

          {status?.connectionError && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fee2e2',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '12px'
              }}
            >
              <strong>Diagnostic Result:</strong> {status.connectionError}
            </div>
          )}
        </div>

        {/* Webhook Configuration Information */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
            Meta Webhook Configuration
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
            Configure these parameters in Meta Developer Portal (App → WhatsApp → Configuration) to receive real-time delivery and read receipts:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '6px' }}>
              <span><strong>Callback URL:</strong> <code>{window.location.origin}/webhook</code></span>
              <button
                type="button"
                onClick={copyWebhookUrl}
                style={{ background: 'none', border: 'none', color: '#008069', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
              >
                <Copy size={13} /> {copiedWebhook ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '6px' }}>
              <strong>Verify Token:</strong> <code>{status?.webhookVerifyToken || 'dlb_webhook_token_secure_2026'}</code>
            </div>
          </div>
        </div>

        {/* Credentials Form */}
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setShowConfig((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: '#008069',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Key size={14} /> {showConfig ? 'Hide Meta API Credentials' : 'Configure Meta Cloud API Credentials'}
          </button>
        </div>

        {showConfig && (
          <form onSubmit={handleSaveMeta} style={{ marginTop: '12px', borderTop: '1px solid #e9edef', paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Meta WhatsApp Business Account (WABA) ID
                </label>
                <input
                  type="text"
                  className="composer-input-pill"
                  style={{ width: '100%', borderRadius: '6px', padding: '8px 12px' }}
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="e.g. 109283749182736"
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Phone Number ID
                </label>
                <input
                  type="text"
                  className="composer-input-pill"
                  style={{ width: '100%', borderRadius: '6px', padding: '8px 12px' }}
                  value={phoneId}
                  onChange={(e) => setPhoneId(e.target.value)}
                  placeholder="e.g. 104928172948172"
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                System User Permanent Access Token
                {status?.tokenMasked && (
                  <span style={{ marginLeft: '8px', color: '#059669', fontWeight: 500 }}>
                    (Currently saved: {status.tokenMasked})
                  </span>
                )}
              </label>
              <input
                type="password"
                className="composer-input-pill"
                style={{ width: '100%', borderRadius: '6px', padding: '8px 12px' }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG... (Leave empty to keep saved token)"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="submit" className="btn-bizz-primary" disabled={verifying}>
                {verifying ? 'Verifying with Meta...' : 'Save & Verify Credentials'}
              </button>
            </div>
          </form>
        )}

        {/* Live Test Message Dispatche */}
        <div style={{ marginTop: '24px', borderTop: '1px solid #e9edef', paddingTop: '16px' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#111b21', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={15} color="#008069" /> Send Real Test Message
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            Send a live test template message to an authorized test recipient phone number to verify Meta Cloud API message dispatch.
          </p>
          <form onSubmit={handleSendTestMessage} style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="composer-input-pill"
              style={{ flex: 1, borderRadius: '6px', padding: '8px 12px' }}
              placeholder="Recipient phone number with country code (e.g. +91 98765 43210)"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            />
            <button
              type="submit"
              className="btn-bizz-secondary"
              disabled={testSending || !testRecipient}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={13} /> {testSending ? 'Sending...' : 'Send Test'}
            </button>
          </form>
        </div>
      </div>

      {/* SECTION 2: ACCOUNT */}
      <div className="settings-section-title">ACCOUNT</div>
      <div className="settings-white-card">
        {/* User row matching Screenshot 3 */}
        <div className="settings-row-item">
          <div className="settings-item-avatar">
            <User size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#111b21' }}>laxman@srm.com</div>
            <div style={{ fontSize: '12.5px', color: '#54656f' }}>laxman@srm.com</div>
          </div>
        </div>

        {/* Company row matching Screenshot 3 */}
        <div className="settings-row-item">
          <div className="settings-item-avatar">
            <Building size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#111b21' }}>DLB</div>
            <div style={{ fontSize: '12.5px', color: '#54656f' }}>Reports are scoped to this company</div>
          </div>
        </div>
      </div>
    </div>
  );
};
