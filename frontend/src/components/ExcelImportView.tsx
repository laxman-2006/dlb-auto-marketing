import React, { useState } from 'react';
import { api } from '../api';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Download, ArrowRight, Table } from 'lucide-react';

export const ExcelImportView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [sheetInfo, setSheetInfo] = useState<any | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [consentCol, setConsentCol] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('91');
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = e.target.files[0];
    setFile(selected);
    setErrorMsg(null);
    setSummary(null);

    const formData = new FormData();
    formData.append('file', selected);

    try {
      const data = await api.inspectExcel(formData);
      setSheetInfo(data);
      setSelectedSheet(data.defaultSheet);

      // Auto-detect columns
      const headers: string[] = data.headers || [];
      const lowerHeaders = headers.map((h) => h.toLowerCase());

      const phoneIdx = lowerHeaders.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
      if (phoneIdx !== -1) setPhoneCol(headers[phoneIdx]);

      const nameIdx = lowerHeaders.findIndex((h) => h.includes('name') || h.includes('customer') || h.includes('client'));
      if (nameIdx !== -1) setNameCol(headers[nameIdx]);

      const consentIdx = lowerHeaders.findIndex((h) => h.includes('consent') || h.includes('opt') || h.includes('whatsapp') || h.includes('agree'));
      if (consentIdx !== -1) setConsentCol(headers[consentIdx]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to inspect file');
    }
  };

  const handleExecuteImport = async () => {
    if (!file || !phoneCol) {
      alert('Please select the Mobile Number column.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('phoneColumn', phoneCol);
    if (nameCol) formData.append('nameColumn', nameCol);
    if (consentCol) formData.append('consentColumn', consentCol);
    formData.append('defaultCountryCode', countryCode);

    try {
      const result = await api.executeImport(formData);
      setSummary(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Import failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ padding: '18px 24px', marginBottom: '20px' }}>
        <h2 className="card-title">
          <FileSpreadsheet size={20} color="var(--wa-green)" /> High-Volume Excel & CSV Contact Import
        </h2>
        <p className="card-subtitle">
          Supports .xlsx, .xls, and .csv files. Optimized for 12,000, 20,000, and 25,000+ rows with streaming validation, E.164 phone normalization, duplicate detection, and consent tracking.
        </p>
      </div>

      {errorMsg && (
        <div style={{ padding: '14px 18px', background: 'rgba(234, 67, 53, 0.1)', border: '1px solid rgba(234, 67, 53, 0.3)', borderRadius: 'var(--radius-md)', color: '#f87171', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={18} /> {errorMsg}
        </div>
      )}

      {/* Upload Zone */}
      {!sheetInfo && (
        <div
          className="card"
          style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '50px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-secondary)',
            transition: 'border-color 0.2s'
          }}
          onClick={() => document.getElementById('excelFileInput')?.click()}
        >
          <Upload size={44} color="var(--wa-green)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Click or drag Excel/CSV file here to import
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Accepts .xlsx, .xls, and .csv format up to 50MB (Supports 25k+ contacts).
          </p>
          <input
            id="excelFileInput"
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Mapping & Preview */}
      {sheetInfo && !summary && (
        <div>
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  <Table size={18} color="var(--wa-green)" /> Column Mapping & Configuration
                </span>
                <span className="card-subtitle">
                  File: {sheetInfo.fileName} ({sheetInfo.totalRows.toLocaleString()} rows detected)
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setSheetInfo(null); setFile(null); }}
              >
                Change File
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {/* Sheet Select */}
              <div className="form-group">
                <label className="form-label">Select Sheet</label>
                <select
                  className="form-select"
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                >
                  {sheetInfo.sheetNames.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Mobile Number Column */}
              <div className="form-group">
                <label className="form-label">
                  Mobile Number Column <span style={{ color: 'var(--status-red)' }}>*</span>
                </label>
                <select
                  className="form-select"
                  value={phoneCol}
                  onChange={(e) => setPhoneCol(e.target.value)}
                  style={{ borderColor: phoneCol ? 'var(--wa-green)' : 'var(--status-yellow)' }}
                >
                  <option value="">-- Select Column --</option>
                  {sheetInfo.headers.map((h: string) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Customer Name Column */}
              <div className="form-group">
                <label className="form-label">Customer Name Column (Optional)</label>
                <select
                  className="form-select"
                  value={nameCol}
                  onChange={(e) => setNameCol(e.target.value)}
                >
                  <option value="">-- None (Defaults to 'Valued Customer') --</option>
                  {sheetInfo.headers.map((h: string) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Consent Opt-In Column */}
              <div className="form-group">
                <label className="form-label">WhatsApp Opt-in Column (Optional)</label>
                <select
                  className="form-select"
                  value={consentCol}
                  onChange={(e) => setConsentCol(e.target.value)}
                >
                  <option value="">-- None (Mark as Consent Required) --</option>
                  {sheetInfo.headers.map((h: string) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Default Country Code */}
              <div className="form-group">
                <label className="form-label">Default Country Code</label>
                <select
                  className="form-select"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  <option value="91">+91 (India)</option>
                  <option value="1">+1 (US/Canada)</option>
                  <option value="44">+44 (United Kingdom)</option>
                  <option value="971">+971 (UAE)</option>
                </select>
              </div>
            </div>

            {/* Preview of first 20 records */}
            <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              First 20 Records Preview
            </h4>
            <div className="table-container" style={{ maxHeight: '260px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Mobile Number</th>
                    <th>Opt-In Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetInfo.previewRows.map((row: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td>{nameCol ? row[nameCol] || '-' : 'Customer'}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--wa-green)' }}>
                        {phoneCol ? row[phoneCol] || '-' : '-'}
                      </td>
                      <td>{consentCol ? row[consentCol] || 'No value' : 'Not mapped'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                className="btn btn-primary"
                onClick={handleExecuteImport}
                disabled={isProcessing || !phoneCol}
              >
                {isProcessing ? 'Validating & Ingesting...' : 'Confirm & Execute Import'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Report after completion */}
      {summary && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">
                <CheckCircle2 size={20} color="var(--wa-green)" /> Import Job Completed Successfully
              </span>
              <span className="card-subtitle">
                Job ID: {summary.jobId} | Total Processed: {summary.totalRows.toLocaleString()} rows
              </span>
            </div>
            <a
              href={`/api/import/errors/${summary.jobId}`}
              className="btn btn-secondary btn-sm"
              target="_blank"
              rel="noreferrer"
            >
              <Download size={14} /> Download Rejected Error Report (CSV)
            </a>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Total Rows</span>
              <span className="stat-value">{summary.totalRows.toLocaleString()}</span>
              <span className="stat-sub">From uploaded file</span>
            </div>
            <div className="stat-box" style={{ borderColor: 'var(--wa-green)' }}>
              <span className="stat-label" style={{ color: 'var(--wa-green)' }}>Eligible for Marketing</span>
              <span className="stat-value" style={{ color: 'var(--wa-green)' }}>
                {summary.eligibleForMarketing.toLocaleString()}
              </span>
              <span className="stat-sub">Valid with verified opt-in</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Consent Required</span>
              <span className="stat-value" style={{ color: 'var(--status-yellow)' }}>
                {summary.missingConsent.toLocaleString()}
              </span>
              <span className="stat-sub">Excluded until consent verified</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Duplicates in File</span>
              <span className="stat-value" style={{ color: 'var(--status-red)' }}>
                {summary.duplicateInFile.toLocaleString()}
              </span>
              <span className="stat-sub">Deduplicated automatically</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Duplicates in Database</span>
              <span className="stat-value" style={{ color: 'var(--status-red)' }}>
                {summary.duplicateInDb.toLocaleString()}
              </span>
              <span className="stat-sub">Already in DLB contacts</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Invalid Numbers</span>
              <span className="stat-value" style={{ color: 'var(--status-red)' }}>
                {summary.invalidNumbers.toLocaleString()}
              </span>
              <span className="stat-sub">Malformed phone structure</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setSummary(null); setSheetInfo(null); setFile(null); }}
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
