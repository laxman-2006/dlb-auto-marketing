import React, { useState } from 'react';
import { api } from '../api';
import { Upload, FileSpreadsheet, AlertTriangle, X, Send } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: (summary: any) => void;
  mode?: 'whatsapp' | 'telegram' | 'import';
}

export const UploadExcelModal: React.FC<Props> = ({ onClose, onSuccess, mode = 'import' }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sheetInfo, setSheetInfo] = useState<any | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');
  const [consentCol, setConsentCol] = useState<string>('');
  const [broadcastMsg, setBroadcastMsg] = useState<string>('नमस्ते! DLB AUTO MARKETING में आपका स्वागत है।');
  const [attachedMedia, setAttachedMedia] = useState<File | null>(null);
  const countryCode = '91';
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = e.target.files[0];
    setFile(selected);
    setErrorMsg(null);
    setIsInspecting(true);

    const formData = new FormData();
    formData.append('file', selected);

    try {
      const data = await api.inspectExcel(formData);
      setSheetInfo(data);
      setSelectedSheet(data.defaultSheet);

      // Auto-detect columns
      const headers: string[] = data.headers || [];
      const lower = headers.map((h) => h.toLowerCase());

      const pIdx = lower.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number'));
      if (pIdx !== -1) setPhoneCol(headers[pIdx]);

      const nIdx = lower.findIndex((h) => h.includes('name') || h.includes('customer') || h.includes('client'));
      if (nIdx !== -1) setNameCol(headers[nIdx]);

      const cIdx = lower.findIndex((h) => h.includes('opt') || h.includes('consent') || h.includes('whatsapp'));
      if (cIdx !== -1) setConsentCol(headers[cIdx]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to inspect Excel file');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleExecute = async () => {
    if (!file) return;

    if (mode === 'whatsapp') {
      if (!broadcastMsg.trim() && !attachedMedia) {
        alert('कृपया संदेश लिखें (Please enter message text).');
        return;
      }
      setIsImporting(true);
      setErrorMsg(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('messageText', broadcastMsg.trim() || 'Photo Attachment');
        if (phoneCol) formData.append('phoneColumn', phoneCol);
        if (nameCol) formData.append('nameColumn', nameCol);
        if (attachedMedia) formData.append('media', attachedMedia);

        const res = await api.uploadBroadcastWhatsApp(formData);
        onSuccess(res);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || 'WhatsApp broadcast failed');
      } finally {
        setIsImporting(false);
      }
      return;
    }

    if (mode === 'telegram') {
      if (!broadcastMsg.trim() && !attachedMedia) {
        alert('कृपया संदेश लिखें (Please enter message text).');
        return;
      }
      setIsImporting(true);
      setErrorMsg(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('messageText', broadcastMsg.trim() || 'Photo Attachment');
        if (attachedMedia) formData.append('media', attachedMedia);

        const res = await api.uploadBroadcastTelegram(formData);
        onSuccess(res);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || 'Telegram broadcast failed');
      } finally {
        setIsImporting(false);
      }
      return;
    }

    // Default import mode
    if (!phoneCol) {
      alert('Please map the Mobile Number column.');
      return;
    }
    setIsImporting(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('phoneColumn', phoneCol);
    if (nameCol) formData.append('nameColumn', nameCol);
    if (consentCol) formData.append('consentColumn', consentCol);
    formData.append('defaultCountryCode', countryCode);

    try {
      const summary = await api.executeImport(formData);
      onSuccess(summary);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const isBroadcast = mode === 'whatsapp' || mode === 'telegram';
  const brandColor = mode === 'telegram' ? '#0088cc' : '#008069';
  const channelTitle = mode === 'telegram' ? 'Telegram Personal Message' : mode === 'whatsapp' ? 'WhatsApp Personal Message' : 'Contacts';

  // Current IST time greeting helper for preview
  const getPreviewGreeting = () => {
    const hr = new Date().getHours();
    if (hr >= 4 && hr < 12) return 'Good morning';
    if (hr >= 12 && hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} color={brandColor} />
            <div className="modal-title">
              {isBroadcast ? `Excel Direct Broadcast (${channelTitle})` : 'Upload Excel Contact List'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} /> {errorMsg}
          </div>
        )}

        {!sheetInfo ? (
          <div
            style={{
              border: '2px dashed #c4c0b5',
              borderRadius: 'var(--radius-md)',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: '#f8f7f2'
            }}
            onClick={() => document.getElementById('modalFileInput')?.click()}
          >
            <Upload size={38} color={brandColor} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#111b21', marginBottom: '4px' }}>
              {isInspecting ? 'Inspecting workbook...' : 'Click to select .xlsx or .csv file'}
            </div>
            <div style={{ fontSize: '12px', color: '#54656f' }}>
              Accepts 11,000 to 25,000+ rows with auto mobile number & customer name extraction
            </div>
            <input
              id="modalFileInput"
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '13px', color: '#111b21', fontWeight: 600, marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                📄 <strong>{file?.name}</strong> ({sheetInfo.totalRows.toLocaleString()} rows detected)
              </span>
              <button
                className="btn-bizz-secondary"
                style={{ padding: '3px 10px', fontSize: '11px' }}
                onClick={() => { setSheetInfo(null); setFile(null); }}
              >
                Change File
              </button>
            </div>

            {isBroadcast ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                {/* Column Mapping for Names & Phone */}
                {sheetInfo.headers && sheetInfo.headers.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        👤 Name Column (ग्राहक का नाम):
                      </label>
                      <select
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                        value={nameCol}
                        onChange={(e) => setNameCol(e.target.value)}
                      >
                        <option value="">-- Auto-Detect Name from Sheet --</option>
                        {sheetInfo.headers.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        📱 Phone Column (मोबाइल नंबर):
                      </label>
                      <select
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                        value={phoneCol}
                        onChange={(e) => setPhoneCol(e.target.value)}
                      >
                        <option value="">-- Auto-Detect Phone from Sheet --</option>
                        {sheetInfo.headers.map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    संदेश (Message to send to all contacts):
                  </label>
                  <textarea
                    rows={4}
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="यहाँ अपना संदेश लिखें जो सभी ग्राहकों को जाएगा..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d7db',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Live Greeting & Personalization Preview */}
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px' }}>
                  <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✨ Smart Name Personalization (हर ग्राहक को नाम से ग्रीटिंग):
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px dashed #2dd4bf', color: '#134e4a', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {`${getPreviewGreeting()} [Customer Name] जी,\n\n${broadcastMsg || 'DLB AUTO MARKETING me aapka swagat hai...'}`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#0f766e', marginTop: '4px' }}>
                    * एक्सेल में दिए गए नाम और समय (सुबह / दोपहर / शाम) के अनुसार हर ग्राहक को पर्सनलाइज़्ड ग्रीटिंग अपने आप जुड़कर जाएगी।
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    फोटो / फ़ाइल जोड़ें (Optional Attachment):
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setAttachedMedia(e.target.files[0]);
                      }
                    }}
                    style={{ fontSize: '12.5px' }}
                  />
                  {attachedMedia && (
                    <div style={{ fontSize: '12px', color: '#008069', marginTop: '4px' }}>
                      ✓ Attached: {attachedMedia.name}
                    </div>
                  )}
                </div>

                <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: '8px', fontSize: '12.5px', color: '#065f46' }}>
                  🛡️ <strong>WhatsApp Anti-Ban Safe Speed Active:</strong> 1 घंटे में केवल <strong>10 से 15 मैसेज</strong> (Random delays: 2 मिनट, 3 मिनट, 5 मिनट, 10 मिनट के अंतराल पर)। यह सिस्टम 24 घंटे लगातार चलेगा और आपके WhatsApp नंबर पर कोई स्ट्राइक या बैन नहीं लगेगा!
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      Worksheet
                    </label>
                    <select
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d7db', fontSize: '13px' }}
                      value={selectedSheet}
                      onChange={(e) => setSelectedSheet(e.target.value)}
                    >
                      {sheetInfo.sheetNames.map((s: string) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      Mobile Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #008069', fontSize: '13px' }}
                      value={phoneCol}
                      onChange={(e) => setPhoneCol(e.target.value)}
                    >
                      <option value="">-- Select Column --</option>
                      {sheetInfo.headers.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      Customer Name
                    </label>
                    <select
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d7db', fontSize: '13px' }}
                      value={nameCol}
                      onChange={(e) => setNameCol(e.target.value)}
                    >
                      <option value="">-- None --</option>
                      {sheetInfo.headers.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                      WhatsApp Opt-in
                    </label>
                    <select
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d7db', fontSize: '13px' }}
                      value={consentCol}
                      onChange={(e) => setConsentCol(e.target.value)}
                    >
                      <option value="">-- None (Requires Consent) --</option>
                      {sheetInfo.headers.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#54656f', marginBottom: '6px' }}>
                  First 10 Rows Preview:
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e2da', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
                  <table className="bizz-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Mobile Number</th>
                        <th>Opt-In Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetInfo.previewRows.slice(0, 10).map((r: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td>{nameCol ? r[nameCol] || '-' : 'Valued Customer'}</td>
                          <td style={{ fontFamily: 'monospace', color: '#008069' }}>
                            {phoneCol ? r[phoneCol] || '-' : '-'}
                          </td>
                          <td>{consentCol ? r[consentCol] || 'No' : 'Not mapped'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-bizz-secondary" onClick={onClose} disabled={isImporting}>
                Cancel
              </button>
              <button
                className="btn-bizz-primary"
                style={{
                  backgroundColor: brandColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  padding: '8px 18px'
                }}
                onClick={handleExecute}
                disabled={isImporting || (!isBroadcast && !phoneCol)}
              >
                <Send size={15} />
                {isImporting
                  ? 'Broadcasting to contacts...'
                  : isBroadcast
                  ? `🚀 Start Broadcast to all ${sheetInfo.totalRows.toLocaleString()} contacts`
                  : 'Confirm & Import Audience'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
