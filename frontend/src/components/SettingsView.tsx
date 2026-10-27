import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Phone, User, Building, RefreshCw, Key } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [status, setStatus] = useState<any | null>(null);
  const [phoneNum, setPhoneNum] = useState('+91 98765 00000');
  const [verifying, setVerifying] = useState(false);

  // Meta Cloud API details
  const [wabaId, setWabaId] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [token, setToken] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setStatus(data);
      if (data.displayPhoneNumber) setPhoneNum(data.displayPhoneNumber);
      if (data.wabaId) setWabaId(data.wabaId);
      if (data.phoneNumberId) setPhoneId(data.phoneNumberId);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyWhatsApp();
      loadStatus();
      alert(`Diagnostics completed: ${result.state}`);
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.connectWhatsApp({
        wabaId,
        phoneNumberId: phoneId,
        systemUserToken: token,
        displayPhoneNumber: phoneNum
      });
      alert(res.success ? 'WhatsApp Business Account verified & connected!' : `Action Required: ${res.status.errorDetail}`);
      loadStatus();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect WhatsApp Business Account?')) return;
    try {
      await api.disconnectWhatsApp();
      loadStatus();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isConnected = status?.connected;

  return (
    <div className="settings-page-container">
      <h1 className="settings-heading">Settings</h1>

      {/* SECTION 1: MY WHATSAPP (FOR FORWARD) matching Screenshot 3 */}
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
              {status?.state || 'CONNECTED'}
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
                style={{ padding: '4px 10px', fontSize: '12px', color: '#b91c1c' }}
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Number input field matching Screenshot 3 */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            className="composer-input-pill"
            style={{ width: '100%', borderRadius: '8px', padding: '10px 14px', border: '1px solid #d1d7db', backgroundColor: '#ffffff' }}
            placeholder="Your WhatsApp number"
            value={phoneNum}
            onChange={(e) => setPhoneNum(e.target.value)}
          />
        </div>

        {/* QR Code Section matching Screenshot 3 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
          <div
            style={{
              padding: '16px',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e2da',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              marginBottom: '14px'
            }}
          >
            {/* High fidelity realistic SVG QR Code */}
            <svg width="220" height="220" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="white" />
              {/* Corner position markers */}
              <rect x="5" y="5" width="30" height="30" rx="4" fill="black" />
              <rect x="9" y="9" width="22" height="22" rx="2" fill="white" />
              <rect x="13" y="13" width="14" height="14" rx="2" fill="#008069" />

              <rect x="65" y="5" width="30" height="30" rx="4" fill="black" />
              <rect x="69" y="9" width="22" height="22" rx="2" fill="white" />
              <rect x="73" y="13" width="14" height="14" rx="2" fill="#008069" />

              <rect x="5" y="65" width="30" height="30" rx="4" fill="black" />
              <rect x="9" y="69" width="22" height="22" rx="2" fill="white" />
              <rect x="13" y="73" width="14" height="14" rx="2" fill="#008069" />

              {/* Data pattern modules */}
              <rect x="42" y="8" width="6" height="6" fill="black" />
              <rect x="52" y="14" width="6" height="6" fill="black" />
              <rect x="42" y="24" width="6" height="6" fill="black" />
              <rect x="12" y="42" width="6" height="6" fill="black" />
              <rect x="24" y="48" width="6" height="6" fill="black" />
              <rect x="40" y="40" width="20" height="20" rx="3" fill="#008069" />
              <rect x="45" y="45" width="10" height="10" fill="white" />
              <rect x="48" y="48" width="4" height="4" fill="#008069" />

              <rect x="68" y="44" width="6" height="6" fill="black" />
              <rect x="78" y="52" width="6" height="6" fill="black" />
              <rect x="86" y="42" width="6" height="6" fill="black" />
              <rect x="42" y="68" width="6" height="6" fill="black" />
              <rect x="52" y="76" width="6" height="6" fill="black" />
              <rect x="72" y="72" width="6" height="6" fill="black" />
              <rect x="82" y="80" width="6" height="6" fill="black" />
              <rect x="64" y="86" width="6" height="6" fill="black" />
            </svg>
          </div>

          <div style={{ fontSize: '13px', color: '#54656f', textAlign: 'center' }}>
            Scan from WhatsApp → Linked devices → Link a device
          </div>

          <button
            onClick={() => setShowConfig((prev) => !prev)}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: '#008069',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Key size={13} /> {showConfig ? 'Hide Meta API Credentials' : 'Configure Meta Cloud API Credentials'}
          </button>
        </div>

        {/* Expandable Meta Cloud API Credentials */}
        {showConfig && (
          <form onSubmit={handleSaveMeta} style={{ marginTop: '20px', borderTop: '1px solid #e9edef', paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  WABA ID
                </label>
                <input
                  type="text"
                  className="composer-input-pill"
                  style={{ width: '100%', borderRadius: '6px', padding: '8px 12px' }}
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="e.g. WABA_DLB_AUTO_10928374"
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
                  placeholder="e.g. PHONE_ID_919876500000"
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                System User Permanent Access Token
              </label>
              <input
                type="password"
                className="composer-input-pill"
                style={{ width: '100%', borderRadius: '6px', padding: '8px 12px' }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG... (Leave empty to keep saved)"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-bizz-primary">
                Save & Verify Credentials
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SECTION 2: ACCOUNT matching Screenshot 3 */}
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
