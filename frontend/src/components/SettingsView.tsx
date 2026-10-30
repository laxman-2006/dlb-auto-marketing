import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import {
  Phone,
  Send,
  RefreshCw,
  CheckCircle,
  LogOut,
  Loader2,
  Key,
  Smartphone,
  QrCode,
  ArrowLeft
} from 'lucide-react';
import { YoutubeIcon, InstagramIcon, FacebookIcon } from './SocialIcons';

interface SettingsViewProps {
  onBack?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'telegram' | 'youtube' | 'instagram' | 'facebook'>('whatsapp');

  // WhatsApp states
  const [waStatus, setWaStatus] = useState<any | null>(null);
  const [waVerifying, setWaVerifying] = useState(false);
  const [waTestSending, setWaTestSending] = useState(false);
  const [waTestRecipient, setWaTestRecipient] = useState('');

  // Telegram states
  const [tgStatus, setTgStatus] = useState<any | null>(null);
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgConnectingBot, setTgConnectingBot] = useState(false);
  const [tgPhone, setTgPhone] = useState('');
  const [tgCode, setTgCode] = useState('');
  const [tgPassword, setTgPassword] = useState('');
  const [tgCodeSent, setTgCodeSent] = useState(false);
  const [tgSendingCode, setTgSendingCode] = useState(false);
  const [tgVerifyingCode, setTgVerifyingCode] = useState(false);
  const [tgTestRecipient, setTgTestRecipient] = useState('');
  const [tgTestSending, setTgTestSending] = useState(false);
  const [tgModeTab, setTgModeTab] = useState<'qr' | 'bot' | 'phone'>('qr');

  // Social accounts states (YouTube, Instagram, Facebook)
  const [socialAccounts, setSocialAccounts] = useState<any>({});
  const [ytChannelName, setYtChannelName] = useState('DLB Auto Gaming & Motors');
  const [ytClientId, setYtClientId] = useState('');
  const [ytClientSecret, setYtClientSecret] = useState('');
  const [igAccountName, setIgAccountName] = useState('dlb_auto_official');
  const [igToken, setIgToken] = useState('');
  const [fbPageName, setFbPageName] = useState('DLB Auto Marketing Official');
  const [fbPageToken, setFbPageToken] = useState('');
  const [savingSocial, setSavingSocial] = useState(false);

  // Feedback Banner
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const pollTimerRef = useRef<any>(null);

  const loadStatus = async () => {
    try {
      const waData = await api.getWhatsAppStatus();
      setWaStatus(waData);
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
    }

    try {
      const tgData = await api.getTelegramStatus();
      setTgStatus(tgData);
    } catch (err) {
      console.error('Failed to load Telegram status:', err);
    }

    try {
      const socialData = await api.getSocialAccounts();
      if (socialData?.success) {
        setSocialAccounts(socialData.accounts || {});
      }
    } catch (err) {
      console.error('Failed to load social accounts:', err);
    }
  };

  const handleSaveSocial = async (platform: 'youtube' | 'instagram' | 'facebook', connectToggle?: boolean) => {
    try {
      setSavingSocial(true);
      const current = socialAccounts[platform] || {};
      const isConnecting = connectToggle !== undefined ? connectToggle : !current.connected;

      let payload: any = { platform, connected: isConnecting };
      if (platform === 'youtube') {
        payload.account_name = ytChannelName;
        payload.client_id = ytClientId;
        payload.client_secret = ytClientSecret;
      } else if (platform === 'instagram') {
        payload.account_name = igAccountName;
        payload.access_token = igToken;
      } else if (platform === 'facebook') {
        payload.account_name = fbPageName;
        payload.access_token = fbPageToken;
      }

      const res = await api.saveSocialAccount(payload);
      if (res?.success) {
        setBannerMessage({ type: 'success', text: `✅ ${platform.toUpperCase()} connection updated successfully!` });
        await loadStatus();
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Error updating social account' });
    } finally {
      setSavingSocial(false);
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

  // WhatsApp Handlers
  const handleVerifyWa = async () => {
    setWaVerifying(true);
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
      setBannerMessage({ type: 'error', text: err.message || 'WhatsApp verification failed' });
    } finally {
      setWaVerifying(false);
    }
  };

  const handleDisconnectWa = async () => {
    if (!window.confirm('Are you sure you want to disconnect WhatsApp?')) return;
    try {
      await api.disconnectWhatsApp();
      await loadStatus();
      setBannerMessage({ type: 'info', text: 'WhatsApp disconnected. Scan the new QR code to reconnect.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to disconnect WhatsApp' });
    }
  };

  const handleSendTestWa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waTestRecipient) return;
    setWaTestSending(true);
    setBannerMessage(null);
    try {
      const res = await api.sendTestMessage(waTestRecipient);
      if (res.success) {
        setBannerMessage({ type: 'success', text: `Test message sent successfully to ${waTestRecipient}!` });
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Failed to send WhatsApp message' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Message dispatch failed' });
    } finally {
      setWaTestSending(false);
    }
  };

  // Telegram Handlers
  const handleConnectTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tgBotToken.trim()) return;
    setTgConnectingBot(true);
    setBannerMessage(null);
    try {
      const res = await api.connectTelegramBot(tgBotToken.trim());
      if (res.success) {
        setBannerMessage({ type: 'success', text: 'Telegram Bot connected successfully!' });
        await loadStatus();
        setTgBotToken('');
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Bot connection failed' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to connect Telegram bot' });
    } finally {
      setTgConnectingBot(false);
    }
  };

  const handleSendTelegramCode = async () => {
    if (!tgPhone.trim()) return;
    setTgSendingCode(true);
    setBannerMessage(null);
    try {
      const res = await api.sendTelegramPhoneCode(tgPhone.trim());
      if (res.success) {
        setTgCodeSent(true);
        setBannerMessage({ type: 'info', text: 'Verification code sent to your Telegram app!' });
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Failed to send code' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Error sending code' });
    } finally {
      setTgSendingCode(false);
    }
  };

  const handleVerifyTelegramCode = async () => {
    if (!tgCode.trim()) return;
    setTgVerifyingCode(true);
    setBannerMessage(null);
    try {
      const res = await api.verifyTelegramPhoneCode(tgCode.trim(), tgPassword);
      if (res.success) {
        setBannerMessage({ type: 'success', text: 'Telegram logged in successfully!' });
        await loadStatus();
        setTgCode('');
        setTgPassword('');
        setTgCodeSent(false);
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Invalid code' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Verification error' });
    } finally {
      setTgVerifyingCode(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!window.confirm('Are you sure you want to disconnect Telegram?')) return;
    try {
      await api.disconnectTelegram();
      await loadStatus();
      setBannerMessage({ type: 'info', text: 'Telegram session disconnected.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to disconnect Telegram' });
    }
  };

  const handleSendTestTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tgTestRecipient.trim()) return;
    setTgTestSending(true);
    setBannerMessage(null);
    try {
      const res = await api.sendTelegramPersonal({
        recipient: tgTestRecipient.trim(),
        messageText: 'Hello from DLB AUTO MARKETING! Your Telegram connection is working 100% perfectly.'
      });
      if (res.success) {
        setBannerMessage({ type: 'success', text: `Telegram test message sent to ${tgTestRecipient}!` });
      } else {
        setBannerMessage({ type: 'error', text: res.error || 'Failed to send Telegram message' });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message || 'Telegram test message error' });
    } finally {
      setTgTestSending(false);
    }
  };

  const isWaConnected = waStatus?.connected === true || waStatus?.state === 'CONNECTED';
  const isTgConnected = tgStatus?.connected === true || tgStatus?.state === 'CONNECTED';

  return (
    <div className="settings-page-container" style={{ padding: '24px 32px', overflowY: 'auto', position: 'relative' }}>
      <div className="main-watermark-bg" aria-hidden="true" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button className="mobile-back-btn" onClick={onBack} title="Back to Channels">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="settings-heading" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
              Account Connections & Settings
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
              Connect and manage your WhatsApp and Telegram marketing channels
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#E2E8F0', padding: '4px', borderRadius: '10px', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('whatsapp')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'whatsapp' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'whatsapp' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: activeTab === 'whatsapp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Phone size={16} color={isWaConnected ? '#10B981' : '#64748B'} />
            WhatsApp Connect
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isWaConnected ? '#10B981' : '#94A3B8'
              }}
            />
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'telegram' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'telegram' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: activeTab === 'telegram' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Send size={16} color={isTgConnected ? '#0088cc' : '#64748B'} />
            Telegram Connect
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isTgConnected ? '#0088cc' : '#94A3B8'
              }}
            />
          </button>

          <button
            onClick={() => setActiveTab('youtube')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'youtube' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'youtube' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'youtube' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <YoutubeIcon size={15} color={socialAccounts?.youtube?.connected ? '#FF0000' : '#64748B'} />
            YouTube
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: socialAccounts?.youtube?.connected ? '#10B981' : '#94A3B8'
              }}
            />
          </button>

          <button
            onClick={() => setActiveTab('instagram')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'instagram' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'instagram' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'instagram' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <InstagramIcon size={15} color={socialAccounts?.instagram?.connected ? '#E1306C' : '#64748B'} />
            Instagram
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: socialAccounts?.instagram?.connected ? '#10B981' : '#94A3B8'
              }}
            />
          </button>

          <button
            onClick={() => setActiveTab('facebook')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'facebook' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'facebook' ? '#0F172A' : '#64748B',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'facebook' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <FacebookIcon size={15} color={socialAccounts?.facebook?.connected ? '#1877F2' : '#64748B'} />
            Facebook
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: socialAccounts?.facebook?.connected ? '#10B981' : '#94A3B8'
              }}
            />
          </button>
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {bannerMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '8px',
            marginBottom: '20px',
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

      {/* ========================================================================= */}
      {/* TAB 1: WHATSAPP CONNECT */}
      {/* ========================================================================= */}
      {activeTab === 'whatsapp' && (
        <>
          <div className="settings-section-title" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
            WHATSAPP MULTI-DEVICE CONNECTION (WEB QR)
          </div>

          <div className="settings-white-card" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={18} color="#166534" />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#111b21' }}>Link Your WhatsApp</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Scan via WhatsApp → Linked Devices → Link a Device</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: isWaConnected ? '#DCFCE7' : '#FEE2E2',
                    color: isWaConnected ? '#166534' : '#991B1B'
                  }}
                >
                  {isWaConnected ? 'CONNECTED' : (waStatus?.state || 'NOT_CONNECTED')}
                </span>
                <button
                  className="btn-bizz-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}
                  onClick={handleVerifyWa}
                  disabled={waVerifying}
                >
                  <RefreshCw size={12} className={waVerifying ? 'spin' : ''} /> Verify
                </button>
                {isWaConnected && (
                  <button
                    className="btn-bizz-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={handleDisconnectWa}
                  >
                    <LogOut size={12} /> Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* QR / Status Box */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
              {isWaConnected ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '36px 24px',
                    backgroundColor: '#F0FDF4',
                    borderRadius: '12px',
                    border: '1px solid #BBF7D0',
                    width: '100%',
                    maxWidth: '380px',
                    textAlign: 'center'
                  }}
                >
                  <CheckCircle size={52} color="#059669" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                    WhatsApp Connected!
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#15803d', marginBottom: '8px' }}>
                    {waStatus?.displayPhoneNumber || 'Active WhatsApp Account'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#4ADE80' }}>
                    Ready to send WhatsApp Personal Messages & All Group broadcasts.
                  </div>
                </div>
              ) : waStatus?.qrCodeDataUrl ? (
                <>
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      marginBottom: '14px'
                    }}
                  >
                    <img
                      src={waStatus.qrCodeDataUrl}
                      alt="WhatsApp QR Code"
                      style={{ width: '240px', height: '240px', display: 'block', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569', textAlign: 'center', fontWeight: 600 }}>
                    1. Open WhatsApp on your phone<br />
                    2. Go to <strong>Settings → Linked Devices → Link a Device</strong><br />
                    3. Point your camera at this QR code to connect instantly.
                  </div>
                </>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                  <Loader2 size={32} className="spin" style={{ margin: '0 auto 12px' }} />
                  Generating fresh WhatsApp QR code...
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp Test Message */}
          <div className="settings-section-title" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
            WHATSAPP LIVE TEST MESSAGE
          </div>
          <div className="settings-white-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <form onSubmit={handleSendTestWa} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Recipient phone number (e.g. +91 98765 43210)"
                value={waTestRecipient}
                onChange={(e) => setWaTestRecipient(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={waTestSending || !waTestRecipient.trim() || !isWaConnected}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: isWaConnected ? '#10B981' : '#94A3B8',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: isWaConnected && !waTestSending ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Send size={15} />
                {waTestSending ? 'Sending...' : 'Send WhatsApp Test'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TELEGRAM CONNECT */}
      {/* ========================================================================= */}
      {activeTab === 'telegram' && (
        <>
          <div className="settings-section-title" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
            TELEGRAM CLIENT & BOT CONNECTION
          </div>

          <div className="settings-white-card" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} color="#0088cc" />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Link Your Telegram</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {isTgConnected ? `Connected via ${tgStatus?.mode === 'BOT' ? 'Telegram Bot' : 'Telegram Desktop User Link'}` : 'Scan QR code from Telegram or connect Bot Token'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: isTgConnected ? '#E0F2FE' : '#FEE2E2',
                    color: isTgConnected ? '#0369A1' : '#991B1B'
                  }}
                >
                  {isTgConnected ? 'CONNECTED' : (tgStatus?.state || 'NOT_CONNECTED')}
                </span>

                {isTgConnected && (
                  <button
                    className="btn-bizz-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={handleDisconnectTelegram}
                  >
                    <LogOut size={12} /> Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* If Connected */}
            {isTgConnected ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '36px 24px',
                    backgroundColor: '#F0F9FF',
                    borderRadius: '12px',
                    border: '1px solid #BAE6FD',
                    width: '100%',
                    maxWidth: '400px',
                    textAlign: 'center'
                  }}
                >
                  <CheckCircle size={52} color="#0284C7" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0369A1', marginBottom: '4px' }}>
                    Telegram Connected!
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0284C7', marginBottom: '4px' }}>
                    {tgStatus?.verifiedName || 'DLB Telegram Session'}
                  </div>
                  {tgStatus?.username && (
                    <div style={{ fontSize: '13px', color: '#0369A1', marginBottom: '8px' }}>
                      {tgStatus.username}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Mode: {tgStatus?.mode === 'BOT' ? 'Official Telegram Bot' : 'Telegram Desktop User Account'}
                  </div>
                </div>
              </div>
            ) : (
              /* When Not Connected: Tabs for QR Code or Bot Token */
              <div>
                <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: '20px', gap: '20px' }}>
                  <button
                    onClick={() => setTgModeTab('qr')}
                    style={{
                      padding: '10px 4px',
                      border: 'none',
                      borderBottom: tgModeTab === 'qr' ? '2px solid #0088cc' : '2px solid transparent',
                      background: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: tgModeTab === 'qr' ? '#0088cc' : '#64748B',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <QrCode size={16} /> QR Code Login (Mobile Scan)
                  </button>

                  <button
                    onClick={() => setTgModeTab('bot')}
                    style={{
                      padding: '10px 4px',
                      border: 'none',
                      borderBottom: tgModeTab === 'bot' ? '2px solid #0088cc' : '2px solid transparent',
                      background: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: tgModeTab === 'bot' ? '#0088cc' : '#64748B',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Key size={16} /> Bot Token (1-Click)
                  </button>

                  <button
                    onClick={() => setTgModeTab('phone')}
                    style={{
                      padding: '10px 4px',
                      border: 'none',
                      borderBottom: tgModeTab === 'phone' ? '2px solid #0088cc' : '2px solid transparent',
                      background: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: tgModeTab === 'phone' ? '#0088cc' : '#64748B',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Smartphone size={16} /> Phone Code Login
                  </button>
                </div>

                {/* SubTab 1: QR Code */}
                {tgModeTab === 'qr' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}>
                    {tgStatus?.qrCodeDataUrl ? (
                      <>
                        <div
                          style={{
                            padding: '14px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #BAE6FD',
                            borderRadius: '12px',
                            boxShadow: '0 4px 14px rgba(0, 136, 204, 0.1)',
                            marginBottom: '16px'
                          }}
                        >
                          <img
                            src={tgStatus.qrCodeDataUrl}
                            alt="Telegram QR Code"
                            style={{ width: '240px', height: '240px', display: 'block', borderRadius: '4px' }}
                          />
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', textAlign: 'center', fontWeight: 600, lineHeight: '1.6' }}>
                          1. Open Telegram on your phone<br />
                          2. Go to <strong>Settings → Devices → Link Desktop Device</strong><br />
                          3. Point your camera at this QR code to log in instantly.
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                        <Loader2 size={32} className="spin" style={{ margin: '0 auto 12px', color: '#0088cc' }} />
                        Connecting to Telegram gateway and generating QR code...
                      </div>
                    )}
                  </div>
                )}

                {/* SubTab 2: Bot Token */}
                {tgModeTab === 'bot' && (
                  <form onSubmit={handleConnectTelegramBot} style={{ maxWidth: '480px', margin: '0 auto', padding: '16px 0' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      TELEGRAM BOT TOKEN
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '14px',
                        marginBottom: '12px',
                        outline: 'none',
                        fontFamily: 'monospace'
                      }}
                    />
                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px', lineHeight: '1.4' }}>
                      Get your free token from <strong>@BotFather</strong> on Telegram in 10 seconds.
                    </div>
                    <button
                      type="submit"
                      disabled={tgConnectingBot || !tgBotToken.trim()}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#0088cc',
                        color: '#fff',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: tgConnectingBot ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {tgConnectingBot ? 'Connecting...' : 'Connect Telegram Bot (1-Click)'}
                    </button>
                  </form>
                )}

                {/* SubTab 3: Phone Code Login */}
                {tgModeTab === 'phone' && (
                  <div style={{ maxWidth: '440px', margin: '0 auto', padding: '16px 0' }}>
                    {!tgCodeSent ? (
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                          PHONE NUMBER (WITH COUNTRY CODE)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. +91 98765 43210"
                          value={tgPhone}
                          onChange={(e) => setTgPhone(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '14px',
                            marginBottom: '14px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={handleSendTelegramCode}
                          disabled={tgSendingCode || !tgPhone.trim()}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            background: '#0088cc',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: tgSendingCode ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {tgSendingCode ? 'Sending Code...' : 'Send Verification Code'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                          ENTER VERIFICATION CODE
                        </label>
                        <input
                          type="text"
                          placeholder="Enter 5-digit code received on Telegram"
                          value={tgCode}
                          onChange={(e) => setTgCode(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '14px',
                            marginBottom: '12px',
                            outline: 'none',
                            textAlign: 'center',
                            letterSpacing: '4px',
                            fontWeight: 700
                          }}
                        />
                        <label style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                          Cloud 2FA Password (Only if 2-Step Verification is enabled)
                        </label>
                        <input
                          type="password"
                          placeholder="Optional 2FA password"
                          value={tgPassword}
                          onChange={(e) => setTgPassword(e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '14px',
                            marginBottom: '16px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={handleVerifyTelegramCode}
                          disabled={tgVerifyingCode || !tgCode.trim()}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            background: '#0088cc',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: tgVerifyingCode ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {tgVerifyingCode ? 'Verifying...' : 'Complete Telegram Sign-In'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Telegram Test Message */}
          <div className="settings-section-title" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
            TELEGRAM LIVE TEST MESSAGE
          </div>
          <div className="settings-white-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <form onSubmit={handleSendTestTelegram} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Recipient phone number (e.g. +91 98765 43210) or @username"
                value={tgTestRecipient}
                onChange={(e) => setTgTestRecipient(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={tgTestSending || !tgTestRecipient.trim() || !isTgConnected}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: isTgConnected ? '#0088cc' : '#94A3B8',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: isTgConnected && !tgTestSending ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Send size={15} />
                {tgTestSending ? 'Sending...' : 'Send Telegram Test'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* YOUTUBE SETTINGS PANEL */}
      {activeTab === 'youtube' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="settings-white-card" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <YoutubeIcon size={24} color="#FF0000" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
                    YouTube Channel Automation (यूट्यूब)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                    Daily 2 Automated Dispatches: Morning 07:15 AM & Evening 07:15 PM
                  </p>
                </div>
              </div>

              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: socialAccounts?.youtube?.connected ? '#DCFCE7' : '#FEE2E2',
                  color: socialAccounts?.youtube?.connected ? '#15803D' : '#991B1B'
                }}
              >
                {socialAccounts?.youtube?.connected ? '● YouTube Connected' : '○ Not Connected'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Channel Name (चैनल नाम):
                </label>
                <input
                  type="text"
                  value={ytChannelName}
                  onChange={(e) => setYtChannelName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Google Client ID (OAuth):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10928374-apps.googleusercontent.com"
                  value={ytClientId}
                  onChange={(e) => setYtClientId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Google Client Secret / API Key:
              </label>
              <input
                type="password"
                placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={ytClientSecret}
                onChange={(e) => setYtClientSecret(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleSaveSocial('youtube', true)}
                disabled={savingSocial}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  background: '#FF0000',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {savingSocial ? 'Saving...' : 'Save & Connect YouTube (लॉगिन करें)'}
              </button>

              {socialAccounts?.youtube?.connected && (
                <button
                  onClick={() => handleSaveSocial('youtube', false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: '#FEE2E2',
                    color: '#991B1B',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect YouTube
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INSTAGRAM SETTINGS PANEL */}
      {activeTab === 'instagram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="settings-white-card" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FCE7F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InstagramIcon size={24} color="#E1306C" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
                    Instagram Reel Automation (इंस्टाग्राम)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                    Daily 2 Automated Reels: Morning 07:15 AM & Evening 07:15 PM
                  </p>
                </div>
              </div>

              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: socialAccounts?.instagram?.connected ? '#DCFCE7' : '#FEE2E2',
                  color: socialAccounts?.instagram?.connected ? '#15803D' : '#991B1B'
                }}
              >
                {socialAccounts?.instagram?.connected ? '● Instagram Connected' : '○ Not Connected'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Instagram Handle / Account Name:
                </label>
                <input
                  type="text"
                  value={igAccountName}
                  onChange={(e) => setIgAccountName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Instagram User Access Token (Graph API):
                </label>
                <input
                  type="password"
                  placeholder="EAABwzLIX4nwBA..."
                  value={igToken}
                  onChange={(e) => setIgToken(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleSaveSocial('instagram', true)}
                disabled={savingSocial}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {savingSocial ? 'Saving...' : 'Save & Connect Instagram (लॉगिन करें)'}
              </button>

              {socialAccounts?.instagram?.connected && (
                <button
                  onClick={() => handleSaveSocial('instagram', false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: '#FEE2E2',
                    color: '#991B1B',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect Instagram
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FACEBOOK SETTINGS PANEL */}
      {activeTab === 'facebook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="settings-white-card" style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FacebookIcon size={24} color="#1877F2" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
                    Facebook Page Automation (फेसबुक 48 Daily Slots)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748B' }}>
                    48 Daily Dispatches: 24 Hourly Reels on the hour (:00) + 24 Hourly Posts at :30
                  </p>
                </div>
              </div>

              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: socialAccounts?.facebook?.connected ? '#DCFCE7' : '#FEE2E2',
                  color: socialAccounts?.facebook?.connected ? '#15803D' : '#991B1B'
                }}
              >
                {socialAccounts?.facebook?.connected ? '● Facebook Connected' : '○ Not Connected'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Facebook Page Name:
                </label>
                <input
                  type="text"
                  value={fbPageName}
                  onChange={(e) => setFbPageName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Facebook Page Access Token:
                </label>
                <input
                  type="password"
                  placeholder="EAAGxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={fbPageToken}
                  onChange={(e) => setFbPageToken(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleSaveSocial('facebook', true)}
                disabled={savingSocial}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  background: '#1877F2',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {savingSocial ? 'Saving...' : 'Save & Connect Facebook (लॉगिन करें)'}
              </button>

              {socialAccounts?.facebook?.connected && (
                <button
                  onClick={() => handleSaveSocial('facebook', false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: '#FEE2E2',
                    color: '#991B1B',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect Facebook
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
