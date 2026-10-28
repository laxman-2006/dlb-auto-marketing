import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Phone, User, RefreshCw, CheckCircle, Send, LogOut, Loader2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [status, setStatus] = useState<any | null>(null);
  const [phoneNum, setPhoneNum] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const pollTimerRef = useRef<any>(null);

  const loadStatus = async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setStatus(data);
      if (data.displayPhoneNumber && data.displayPhoneNumber !== '+91 98765 00000') {
        setPhoneNum(data.displayPhoneNumber);
      }
    } catch (err: any) {
      console.error('Failed to load WhatsApp status:', err);
    }
  };

  useEffect(() => {
    loadStatus();

    // Auto-poll status every 3 seconds so scanning the QR instantly triggers CONNECTED
    pollTimerRef.current = setInterval(() => {
      loadStatus();
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleVerify = async () => {
    setVerifying(true);
    setBannerMessage(null);
    try {
      const result = await api.verifyWhatsApp();
      await loadStatus();
      if (result.connected) {
        setBannerMessage({ type: 'success', text: 'WhatsApp is connected and active!' });
      } else {
        setBannerMessage({ type: 'info', text: 'Please scan the displayed QR code with WhatsApp on your phone.' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect WhatsApp?')) return;
    try {
      await api.disconnectWhatsApp();
      await loadStatus();
      setPhoneNum('');
      setBannerMessage({ type: 'info', text: 'WhatsApp disconnected. Scan the new QR code to reconnect.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to disconnect' });
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) return;
    setTestSending(true);
    setBannerMessage(null);
    try {
      const res = await api.sendTestMessage(testRecipient);
      if (res.success) {
        setBannerMessage({ type: 'success', text: `Test message sent successfully to ${testRecipient}!` });
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Failed to send message' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Message dispatch failed' });
    } finally {
      setTestSending(false);
    }
  };

  const isConnected = status?.connected === true || status?.state === 'CONNECTED';
  const qrCodeUrl = status?.qrCodeDataUrl;

  return (
    <div className="settings-page-container">
      <h1 className="settings-heading">Settings</h1>

      {/* Inline Feedback Banner */}
      {bannerMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor:
              bannerMessage.type === 'success' ? '#ecfdf5' : bannerMessage.type === 'info' ? '#f0f9ff' : '#fef2f2',
            color: bannerMessage.type === 'success' ? '#065f46' : bannerMessage.type === 'info' ? '#075985' : '#991b1b',
            border: `1px solid ${bannerMessage.type === 'success' ? '#a7f3d0' : bannerMessage.type === 'info' ? '#bae6fd' : '#fecaca'}`
          }}
        >
          <span>{bannerMessage.text}</span>
          <button
            onClick={() => setBannerMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}

      {/* SECTION 1: MY WHATSAPP (FOR FORWARD) - Exact BizzMonitor match */}
      <div className="settings-section-title">MY WHATSAPP (FOR FORWARD)</div>
      <div className="settings-white-card">
        {/* Header row with Link your WhatsApp */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Phone size={18} color="#111b21" />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111b21' }}>Link your WhatsApp</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`status-tag ${isConnected ? 'done' : 'stopped'}`}>
              {isConnected ? 'CONNECTED' : (status?.state || 'NOT_CONNECTED')}
            </span>
            <button
              className="btn-bizz-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={handleVerify}
              disabled={verifying}
            >
              <RefreshCw size={12} className={verifying ? 'spin' : ''} /> Verify
            </button>
            {isConnected && (
              <button
                className="btn-bizz-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleDisconnect}
              >
                <LogOut size={12} /> Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Number input field matching Screenshot 2 */}
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            className="composer-input-pill"
            style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', border: '1px solid #d1d7db', backgroundColor: '#ffffff' }}
            placeholder="Your WhatsApp number"
            value={isConnected ? (status?.displayPhoneNumber || phoneNum) : phoneNum}
            onChange={(e) => setPhoneNum(e.target.value)}
            disabled={isConnected}
          />
        </div>

        {/* QR Code Section - Dynamic Baileys WhatsApp Web QR */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0 20px 0' }}>
          {isConnected ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 24px',
                backgroundColor: '#f0fdf4',
                borderRadius: '12px',
                border: '1px solid #bbf7d0',
                width: '100%',
                maxWidth: '340px',
                textAlign: 'center'
              }}
            >
              <CheckCircle size={56} color="#059669" style={{ marginBottom: '14px' }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                WhatsApp Connected!
              </div>
              <div style={{ fontSize: '13px', color: '#15803d', marginBottom: '8px' }}>
                {status?.displayPhoneNumber || 'Active WhatsApp Session'}
              </div>
              <div style={{ fontSize: '12px', color: '#65a30d' }}>
                Ready to send marketing campaigns and personalized messages.
              </div>
            </div>
          ) : qrCodeUrl ? (
            <>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e2da',
                  borderRadius: '12px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                  marginBottom: '14px'
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="WhatsApp QR Code"
                  style={{ width: '220px', height: '220px', display: 'block', borderRadius: '4px' }}
                />
              </div>
              <div style={{ fontSize: '13px', color: '#54656f', textAlign: 'center', fontWeight: 500 }}>
                Scan from WhatsApp → Linked devices → Link a device
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '50px 20px',
                color: '#64748b',
                gap: '12px'
              }}
            >
              <Loader2 size={32} className="spin" color="#008069" />
              <span style={{ fontSize: '13px' }}>Generating WhatsApp connection QR code...</span>
            </div>
          )}
        </div>

        {/* Test Message Dispatcher (Available when connected) */}
        {isConnected && (
          <div style={{ borderTop: '1px solid #e9edef', paddingTop: '16px', marginTop: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111b21', marginBottom: '8px' }}>
              Send a Test Message
            </div>
            <form onSubmit={handleSendTestMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="composer-input-pill"
                style={{ flex: 1, borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}
                placeholder="Recipient number with country code (e.g. +919876543210)"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
              <button
                type="submit"
                className="btn-bizz-primary"
                disabled={testSending || !testRecipient}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12.5px' }}
              >
                <Send size={13} /> {testSending ? 'Sending...' : 'Send Test'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* SECTION 2: ACCOUNT - Exact BizzMonitor match */}
      <div className="settings-section-title">ACCOUNT</div>
      <div className="settings-white-card">
        {/* User row */}
        <div className="settings-row-item">
          <div className="settings-item-avatar">
            <User size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#111b21' }}>laxman@srm.com</div>
            <div style={{ fontSize: '12.5px', color: '#54656f' }}>laxman@srm.com</div>
          </div>
        </div>

        {/* Company row */}
        <div className="settings-row-item">
          <div className="settings-item-avatar" style={{ padding: 0, overflow: 'hidden', border: 'none', background: 'transparent' }}>
            <img src="/logo.jpg" alt="DLB AUTO MARKETING Logo" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#111b21' }}>DLB AUTO MARKETING</div>
            <div style={{ fontSize: '12.5px', color: '#54656f' }}>Official organization account & campaigns</div>
          </div>
        </div>
      </div>
    </div>
  );
};
