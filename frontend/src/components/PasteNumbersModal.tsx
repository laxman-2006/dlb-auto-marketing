import React, { useState } from 'react';
import { api } from '../api';
import { Edit3, X, ArrowRight } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export const PasteNumbersModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [text, setText] = useState('');
  const [countryCode, setCountryCode] = useState('91');
  const [confirmedConsent, setConfirmedConsent] = useState(true);
  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleValidate = async () => {
    if (!text.trim()) {
      alert('Please paste at least one phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.pasteNumbers({
        rawText: text,
        consentStatus: confirmedConsent ? 'OPTED_IN' : 'CONSENT_REQUIRED',
        defaultCountryCode: countryCode,
        commit: false
      });
      setValidationResult(res);
    } catch (err: any) {
      alert(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!text.trim()) return;
    setImporting(true);
    try {
      const res = await api.pasteNumbers({
        rawText: text,
        consentStatus: confirmedConsent ? 'OPTED_IN' : 'CONSENT_REQUIRED',
        defaultCountryCode: countryCode,
        commit: true
      });
      alert(`Successfully saved ${res.validCount} valid contacts to database.`);
      onSuccess(res.validCount);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit3 size={18} color="#008069" />
            <div className="modal-title">Paste Phone Numbers</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Paste phone numbers separated by new lines, commas, or semicolons. You can optionally prefix a customer name (e.g. <code>Rahul Sharma: 9876543210</code>).
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Default Country Code
            </label>
            <select
              style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid #d1d7db', fontSize: '13.5px' }}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              <option value="91">+91 (India)</option>
              <option value="1">+1 (US/Canada)</option>
              <option value="44">+44 (UK)</option>
              <option value="971">+971 (UAE)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '18px' }}>
            <label style={{ fontSize: '12.5px', color: '#111b21', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmedConsent}
                onChange={(e) => setConfirmedConsent(e.target.checked)}
              />
              Verified WhatsApp Marketing Opt-In
            </label>
          </div>
        </div>

        <textarea
          rows={7}
          placeholder="9876543210&#10;Amit Patel: 9812345678&#10;919876500000"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setValidationResult(null);
          }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #d1d7db',
            fontFamily: 'monospace',
            fontSize: '13px',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />

        {/* Validation Breakdown */}
        {validationResult && (
          <div style={{ marginTop: '14px', background: '#f7f7f5', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid #e2ded5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#54656f', fontWeight: 600 }}>TOTAL PARSED</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#111b21' }}>{validationResult.totalProcessed}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#008069', fontWeight: 600 }}>VALID TO IMPORT</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#008069' }}>{validationResult.validCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>DUPLICATES</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>{validationResult.duplicateCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>INVALID FORMAT</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>{validationResult.invalidCount}</div>
              </div>
            </div>

            {validationResult.invalid?.length > 0 && (
              <div style={{ fontSize: '11.5px', color: '#b91c1c', marginTop: '6px' }}>
                Rejected sample: {validationResult.invalid[0].raw} ({validationResult.invalid[0].reason})
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
          <button className="btn-bizz-secondary" onClick={onClose}>
            Cancel
          </button>
          {!validationResult ? (
            <button className="btn-bizz-primary" onClick={handleValidate} disabled={loading || !text.trim()}>
              {loading ? 'Validating...' : 'Validate Numbers'}
            </button>
          ) : (
            <button
              className="btn-bizz-primary"
              onClick={handleCommit}
              disabled={importing || validationResult.validCount === 0}
            >
              {importing ? 'Saving...' : `Import ${validationResult.validCount} Valid Contacts`}
              <ArrowRight size={14} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
