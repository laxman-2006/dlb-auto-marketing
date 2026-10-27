import React, { useState } from 'react';
import { api } from '../api';
import { Upload, FileSpreadsheet, AlertTriangle, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: (summary: any) => void;
}

export const UploadExcelModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sheetInfo, setSheetInfo] = useState<any | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');
  const [consentCol, setConsentCol] = useState<string>('');
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
    if (!file || !phoneCol) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} color="#008069" />
            <div className="modal-title">Upload Excel Contact List</div>
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
            <Upload size={38} color="#008069" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#111b21', marginBottom: '4px' }}>
              {isInspecting ? 'Inspecting workbook...' : 'Click to select .xlsx or .csv file'}
            </div>
            <div style={{ fontSize: '12px', color: '#54656f' }}>
              Accepts 12,000 to 25,000+ rows with streaming validation
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
            <div style={{ fontSize: '13px', color: '#111b21', fontWeight: 600, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>File: {file?.name} ({sheetInfo.totalRows.toLocaleString()} rows)</span>
              <button
                className="btn-bizz-secondary"
                style={{ padding: '3px 10px', fontSize: '11px' }}
                onClick={() => { setSheetInfo(null); setFile(null); }}
              >
                Change File
              </button>
            </div>

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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-bizz-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn-bizz-primary"
                onClick={handleExecute}
                disabled={isImporting || !phoneCol}
              >
                {isImporting ? 'Ingesting rows...' : 'Confirm & Import Audience'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
