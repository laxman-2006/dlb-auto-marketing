import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Users, Search, UserCheck, ShieldAlert, AlertCircle, Plus, Trash2, CheckCircle2 } from 'lucide-react';

export const ContactsView: React.FC = () => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, eligible: 0, consentRequired: 0, dnc: 0, invalid: 0 });
  const [segment, setSegment] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newConsent, setNewConsent] = useState('OPTED_IN');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contactData, statData] = await Promise.all([
        api.getContacts(page, 20, segment, search),
        api.getContactStats()
      ]);
      setContacts(contactData.contacts || []);
      setTotalPages(contactData.pagination?.totalPages || 1);
      setStats(statData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [segment, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleToggleConsent = async (contact: any) => {
    const nextStatus = contact.consent_status === 'OPTED_IN' ? 'CONSENT_REQUIRED' : 'OPTED_IN';
    try {
      await api.updateConsent(contact.id, nextStatus, 'Manual user toggle');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await api.deleteContact(id);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone) return;
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, phone: newPhone, consentStatus: newConsent })
      });
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="card" style={{ padding: '18px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">
              <Users size={20} color="var(--wa-green)" /> Customer Contacts Database
            </h2>
            <p className="card-subtitle">
              Manage audience records, verify WhatsApp opt-ins, and enforce Do-Not-Contact exclusions.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Segment Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          className={`btn ${segment === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSegment('all'); setPage(1); }}
        >
          All Contacts ({stats.total})
        </button>
        <button
          className={`btn ${segment === 'eligible' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSegment('eligible'); setPage(1); }}
        >
          <UserCheck size={16} /> Eligible for Marketing ({stats.eligible})
        </button>
        <button
          className={`btn ${segment === 'consent_required' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSegment('consent_required'); setPage(1); }}
        >
          <AlertCircle size={16} /> Consent Required ({stats.consentRequired})
        </button>
        <button
          className={`btn ${segment === 'dnc' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSegment('dnc'); setPage(1); }}
        >
          <ShieldAlert size={16} /> Do Not Contact / Opted Out ({stats.dnc})
        </button>
        <button
          className={`btn ${segment === 'invalid' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSegment('invalid'); setPage(1); }}
        >
          Invalid Numbers ({stats.invalid})
        </button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Search by customer name or phone number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
      </div>

      {/* Contacts Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Phone Number (Normalized)</th>
                <th>Raw Input</th>
                <th>Consent Status</th>
                <th>Marketing Eligibility</th>
                <th>Do Not Contact</th>
                <th>Created At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {loading ? 'Loading contacts...' : 'No contacts found matching the criteria.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const isEligible = c.consent_status === 'OPTED_IN' && c.do_not_contact === 0 && c.contact_status === 'VALID';
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name || 'Customer'}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', color: 'var(--wa-green)' }}>
                          +{c.normalized_phone}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.raw_phone}</td>
                      <td>
                        {c.consent_status === 'OPTED_IN' ? (
                          <span className="badge badge-success">OPTED IN</span>
                        ) : c.consent_status === 'OPTED_OUT' ? (
                          <span className="badge badge-danger">OPTED OUT</span>
                        ) : (
                          <span className="badge badge-warning">CONSENT REQ</span>
                        )}
                      </td>
                      <td>
                        {isEligible ? (
                          <span className="badge badge-success">
                            <CheckCircle2 size={12} /> ELIGIBLE
                          </span>
                        ) : (
                          <span className="badge badge-danger">EXCLUDED</span>
                        )}
                      </td>
                      <td>
                        {c.do_not_contact === 1 ? (
                          <span className="badge badge-danger">DNC ACTIVE</span>
                        ) : (
                          <span className="badge badge-neutral">NO</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginRight: '6px' }}
                          onClick={() => handleToggleConsent(c)}
                          title="Toggle Opt-In / Consent Required"
                        >
                          {c.consent_status === 'OPTED_IN' ? 'Revoke Opt-In' : 'Grant Opt-In'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(c.id)}
                          title="Delete contact"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ marginBottom: '16px' }}>Add New Contact</h3>
            <form onSubmit={handleCreateContact}>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Rahul Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9876543210 or +91 9876543210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Opt-In Consent</label>
                <select
                  className="form-select"
                  value={newConsent}
                  onChange={(e) => setNewConsent(e.target.value)}
                >
                  <option value="OPTED_IN">Yes - Explicit Opt-In Verified</option>
                  <option value="CONSENT_REQUIRED">No - Consent Required</option>
                  <option value="OPTED_OUT">Do Not Contact / Opted Out</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
