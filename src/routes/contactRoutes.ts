import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { normalizePhoneNumber } from '../services/phoneNormalizer';

const router = Router();

// GET /api/contacts - List contacts with filtering, search, pagination
router.get('/', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '25', 10);
  const offset = (page - 1) * limit;
  const search = (req.query.q as string || '').trim();
  const segment = (req.query.segment as string || 'all').toLowerCase();

  let whereClauses: string[] = [];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(name LIKE ? OR normalized_phone LIKE ? OR raw_phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (segment === 'eligible') {
    whereClauses.push("consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'");
  } else if (segment === 'consent_required') {
    whereClauses.push("consent_status = 'CONSENT_REQUIRED' AND do_not_contact = 0");
  } else if (segment === 'dnc' || segment === 'opted_out') {
    whereClauses.push("(do_not_contact = 1 OR consent_status = 'OPTED_OUT')");
  } else if (segment === 'invalid') {
    whereClauses.push("contact_status = 'INVALID'");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalCount = db.prepare(`SELECT COUNT(*) as count FROM contacts ${whereSql}`).get(...params) as { count: number };
  const contacts = db.prepare(`
    SELECT * FROM contacts
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    contacts,
    pagination: {
      page,
      limit,
      total: totalCount.count,
      totalPages: Math.ceil(totalCount.count / limit)
    }
  });
});

// GET /api/contacts/stats - Summary counts per segment
router.get('/stats', (req: Request, res: Response) => {
  const total = (db.prepare('SELECT COUNT(*) as count FROM contacts').get() as any).count;
  const eligible = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'").get() as any).count;
  const consentRequired = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE consent_status = 'CONSENT_REQUIRED' AND do_not_contact = 0").get() as any).count;
  const dnc = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE do_not_contact = 1 OR consent_status = 'OPTED_OUT'").get() as any).count;
  const invalid = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE contact_status = 'INVALID'").get() as any).count;

  res.json({
    total,
    eligible,
    consentRequired,
    dnc,
    invalid
  });
});

// POST /api/contacts - Add single contact manually
router.post('/', (req: Request, res: Response): any => {
  const { name, phone, consentStatus, defaultCountryCode } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  const norm = normalizePhoneNumber(phone, defaultCountryCode || '91');
  if (!norm.isValid) {
    return res.status(400).json({ error: norm.reason || 'Invalid phone number format.' });
  }

  const existing = db.prepare('SELECT id FROM contacts WHERE normalized_phone = ?').get(norm.normalized);
  if (existing) {
    return res.status(409).json({ error: 'A contact with this phone number already exists.' });
  }

  const id = uuidv4();
  const consent = consentStatus === 'OPTED_IN' ? 'OPTED_IN' : 'CONSENT_REQUIRED';
  const dnc = consentStatus === 'OPTED_OUT' ? 1 : 0;

  db.prepare(`
    INSERT INTO contacts (
      id, name, raw_phone, normalized_phone, country_code, consent_status,
      consent_source, consent_timestamp, contact_status, do_not_contact
    ) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ENTRY', ?, 'VALID', ?)
  `).run(
    id,
    name || 'Customer',
    phone,
    norm.normalized,
    norm.countryCode,
    consent,
    consent === 'OPTED_IN' ? new Date().toISOString() : null,
    dnc
  );

  const newContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  return res.status(201).json(newContact);
});

// PATCH /api/contacts/:id/consent - Update consent status
router.patch('/:id/consent', (req: Request, res: Response): any => {
  const { id } = req.params;
  const { consentStatus, notes } = req.body; // 'OPTED_IN', 'OPTED_OUT', 'CONSENT_REQUIRED'

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as any;
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found.' });
  }

  let doNotContact = contact.do_not_contact;
  let timestamp = contact.consent_timestamp;

  if (consentStatus === 'OPTED_IN') {
    doNotContact = 0;
    timestamp = new Date().toISOString();
  } else if (consentStatus === 'OPTED_OUT') {
    doNotContact = 1;
    // Cancel any pending campaign messages
    db.prepare("UPDATE campaign_recipients SET status = 'CANCELLED' WHERE phone_number = ? AND status = 'QUEUED'").run(contact.normalized_phone);
  }

  db.prepare(`
    UPDATE contacts
    SET consent_status = ?,
        do_not_contact = ?,
        consent_timestamp = ?,
        consent_source = 'MANUAL_UPDATE',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(consentStatus, doNotContact, timestamp, id);

  db.prepare(`
    INSERT INTO consent_records (id, contact_id, phone_number, status, source, notes)
    VALUES (?, ?, ?, ?, 'MANUAL_OVERRIDE', ?)
  `).run(uuidv4(), id, contact.normalized_phone, consentStatus, notes || 'Consent updated by manager');

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  return res.json(updated);
});

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  res.json({ success: true, message: 'Contact deleted.' });
});

// POST /api/contacts/paste - Parse, validate, deduplicate, and bulk import pasted numbers
router.post('/paste', (req: Request, res: Response): any => {
  const { rawText, consentStatus = 'OPTED_IN', defaultCountryCode = '91', commit = false } = req.body;
  if (!rawText || !rawText.trim()) {
    return res.status(400).json({ error: 'Please enter or paste phone numbers.' });
  }

  // Split lines or commas or semicolons
  const rawEntries = rawText
    .split(/[\n,;]+/)
    .map((e: string) => e.trim())
    .filter(Boolean);

  const existingRows = db.prepare('SELECT normalized_phone FROM contacts').all() as { normalized_phone: string }[];
  const existingPhones = new Set(existingRows.map((r) => r.normalized_phone));

  const seenInInput = new Set<string>();
  const validList: any[] = [];
  const duplicateList: any[] = [];
  const invalidList: any[] = [];

  for (const entry of rawEntries) {
    let name = 'Valued Customer';
    let phonePart = entry;

    // Check if name is attached (e.g. "Rahul: 9876543210" or "Rahul - 9876543210")
    if (entry.includes(':')) {
      const parts = entry.split(':');
      name = parts[0].trim() || 'Valued Customer';
      phonePart = parts.slice(1).join(':').trim();
    } else if (entry.includes(' - ')) {
      const parts = entry.split(' - ');
      name = parts[0].trim() || 'Valued Customer';
      phonePart = parts.slice(1).join(' - ').trim();
    }

    const norm = normalizePhoneNumber(phonePart, defaultCountryCode);
    if (!norm.isValid) {
      invalidList.push({
        raw: entry,
        reason: norm.reason || 'Invalid phone structure'
      });
      continue;
    }

    if (seenInInput.has(norm.normalized)) {
      duplicateList.push({
        phone: norm.normalized,
        raw: entry,
        reason: 'Duplicate in pasted text'
      });
      continue;
    }
    seenInInput.add(norm.normalized);

    const isDuplicateInDb = existingPhones.has(norm.normalized);
    if (isDuplicateInDb) {
      duplicateList.push({
        phone: norm.normalized,
        raw: entry,
        reason: 'Already exists in contacts database'
      });
      continue;
    }

    validList.push({
      id: uuidv4(),
      name,
      raw_phone: phonePart,
      normalized_phone: norm.normalized,
      country_code: norm.countryCode,
      consent_status: consentStatus,
      do_not_contact: consentStatus === 'OPTED_OUT' ? 1 : 0
    });
  }

  // If user confirmed import (commit: true), batch insert into SQLite database
  if (commit && validList.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO contacts (
        id, name, raw_phone, normalized_phone, country_code,
        consent_status, consent_source, consent_timestamp, contact_status, do_not_contact, import_batch_id
      ) VALUES (
        @id, @name, @raw_phone, @normalized_phone, @country_code,
        @consent_status, 'MANUAL_PASTE', CURRENT_TIMESTAMP, 'VALID', @do_not_contact, @batchId
      )
    `);

    const insertConsentStmt = db.prepare(`
      INSERT INTO consent_records (id, contact_id, phone_number, status, source, notes)
      VALUES (?, ?, ?, ?, 'MANUAL_PASTE', 'Pasted numbers batch import')
    `);

    const batchId = `PASTE_${Date.now()}`;
    const insertTx = db.transaction((items) => {
      for (const item of items) {
        insertStmt.run({ ...item, batchId });
        if (item.consent_status === 'OPTED_IN') {
          insertConsentStmt.run(uuidv4(), item.id, item.normalized_phone, 'OPTED_IN');
        }
      }
    });

    insertTx(validList);
  }

  return res.json({
    totalProcessed: rawEntries.length,
    validCount: validList.length,
    duplicateCount: duplicateList.length,
    invalidCount: invalidList.length,
    valid: validList.slice(0, 50),
    duplicates: duplicateList.slice(0, 20),
    invalid: invalidList.slice(0, 20),
    committed: commit
  });
});

export default router;
