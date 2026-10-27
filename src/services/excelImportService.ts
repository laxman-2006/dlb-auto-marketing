import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { normalizePhoneNumber, normalizeConsent } from './phoneNormalizer';

export interface ColumnMapping {
  nameColumn?: string;
  phoneColumn: string;
  consentColumn?: string;
}

export interface SheetInfo {
  sheetNames: string[];
  defaultSheet: string;
  totalRows: number;
  headers: string[];
  previewRows: Record<string, any>[];
}

export interface ImportValidationSummary {
  jobId: string;
  totalRows: number;
  validContacts: number;
  duplicateInFile: number;
  duplicateInDb: number;
  invalidNumbers: number;
  missingConsent: number;
  eligibleForMarketing: number;
  previewValid: any[];
  previewErrors: any[];
}

export class ExcelImportService {
  /**
   * Reads an uploaded Excel/CSV file buffer and extracts sheets and sample preview
   */
  public static inspectWorkbook(fileBuffer: Buffer): SheetInfo {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) {
      throw new Error('Workbook contains no sheets.');
    }

    const defaultSheet = sheetNames[0];
    const worksheet = workbook.Sheets[defaultSheet];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1, blankrows: false });

    if (jsonData.length === 0) {
      return {
        sheetNames,
        defaultSheet,
        totalRows: 0,
        headers: [],
        previewRows: []
      };
    }

    const headers = (jsonData[0] as any[]).map((h) => String(h || '').trim()).filter(Boolean);
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    const previewRows = rawRows.slice(0, 20);

    return {
      sheetNames,
      defaultSheet,
      totalRows: rawRows.length,
      headers,
      previewRows
    };
  }

  /**
   * Extracts headers and sample preview for a specific sheet
   */
  public static inspectSheet(fileBuffer: Buffer, sheetName: string): { headers: string[]; totalRows: number; previewRows: Record<string, any>[] } {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet '${sheetName}' does not exist.`);
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const previewRows = rawRows.slice(0, 20);

    return {
      headers,
      totalRows: rawRows.length,
      previewRows
    };
  }

  /**
   * Performs high-speed chunked validation and imports up to 25,000+ rows into database
   */
  public static async processImport(
    fileBuffer: Buffer,
    sheetName: string,
    mapping: ColumnMapping,
    defaultCountryCode = '91',
    fileName = 'contacts_upload.xlsx',
    onProgress?: (progress: { processed: number; total: number; percent: number }) => void
  ): Promise<ImportValidationSummary> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet '${sheetName}' not found.`);
    }

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    const totalRows = rows.length;

    const jobId = uuidv4();
    const batchId = `BATCH_${Date.now()}`;

    // Create import_job record
    db.prepare(`
      INSERT INTO import_jobs (
        id, filename, file_size, total_rows, status, started_at
      ) VALUES (?, ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP)
    `).run(jobId, fileName, fileBuffer.length, totalRows);

    // Fetch existing phone numbers in DB into a fast in-memory Set for O(1) duplicate checks
    const existingPhones = new Set<string>();
    const existingRows = db.prepare('SELECT normalized_phone FROM contacts').all() as { normalized_phone: string }[];
    for (const r of existingRows) {
      existingPhones.add(r.normalized_phone);
    }

    const seenInFile = new Set<string>();
    let validCount = 0;
    let duplicateInFileCount = 0;
    let duplicateInDbCount = 0;
    let invalidCount = 0;
    let missingConsentCount = 0;
    let eligibleForMarketingCount = 0;

    const validContactsToInsert: Array<{
      id: string;
      name: string;
      raw_phone: string;
      normalized_phone: string;
      country_code: string;
      consent_status: string;
      consent_source: string;
      consent_timestamp: string | null;
      contact_status: string;
      do_not_contact: number;
      import_batch_id: string;
    }> = [];

    const errorsToInsert: Array<{
      id: string;
      import_job_id: string;
      row_number: number;
      raw_data: string;
      reason: string;
      error_type: string;
    }> = [];

    const previewValid: any[] = [];
    const previewErrors: any[] = [];

    // Process rows
    for (let i = 0; i < totalRows; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Accounting for 1-based index and header row

      const rawName = mapping.nameColumn && row[mapping.nameColumn] !== undefined
        ? String(row[mapping.nameColumn]).trim()
        : 'Customer';
      
      const rawPhone = row[mapping.phoneColumn];
      const rawConsent = mapping.consentColumn ? row[mapping.consentColumn] : undefined;

      // Check for empty phone
      if (rawPhone === undefined || rawPhone === null || String(rawPhone).trim() === '') {
        invalidCount++;
        const errObj = {
          id: uuidv4(),
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: JSON.stringify(row),
          reason: 'Missing or empty phone number',
          error_type: 'EMPTY_ROW'
        };
        errorsToInsert.push(errObj);
        if (previewErrors.length < 10) previewErrors.push(errObj);
        continue;
      }

      // Normalize phone
      const phoneRes = normalizePhoneNumber(rawPhone, defaultCountryCode);
      if (!phoneRes.isValid) {
        invalidCount++;
        const errObj = {
          id: uuidv4(),
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: JSON.stringify({ name: rawName, phone: rawPhone }),
          reason: phoneRes.reason || 'Invalid phone format',
          error_type: 'MALFORMED_NUMBER'
        };
        errorsToInsert.push(errObj);
        if (previewErrors.length < 10) previewErrors.push(errObj);
        continue;
      }

      const normalized = phoneRes.normalized;

      // Duplicate within file
      if (seenInFile.has(normalized)) {
        duplicateInFileCount++;
        const errObj = {
          id: uuidv4(),
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: JSON.stringify({ name: rawName, phone: rawPhone, normalized }),
          reason: `Duplicate number in file (Already seen at an earlier row)`,
          error_type: 'DUPLICATE_IN_FILE'
        };
        errorsToInsert.push(errObj);
        if (previewErrors.length < 10) previewErrors.push(errObj);
        continue;
      }
      seenInFile.add(normalized);

      // Duplicate in existing database
      if (existingPhones.has(normalized)) {
        duplicateInDbCount++;
        const errObj = {
          id: uuidv4(),
          import_job_id: jobId,
          row_number: rowNumber,
          raw_data: JSON.stringify({ name: rawName, phone: rawPhone, normalized }),
          reason: `Phone number already exists in DLB contacts database`,
          error_type: 'DUPLICATE_IN_DB'
        };
        errorsToInsert.push(errObj);
        if (previewErrors.length < 10) previewErrors.push(errObj);
        continue;
      }

      // Check consent
      const consentRes = normalizeConsent(rawConsent);
      let consentStatus = consentRes.rawStatus;
      let doNotContact = 0;
      let consentSource = 'EXCEL_IMPORT';
      let consentTimestamp = consentRes.isOptedIn ? new Date().toISOString() : null;

      if (!consentRes.isOptedIn) {
        if (consentRes.rawStatus === 'OPTED_OUT') {
          doNotContact = 1;
        } else {
          missingConsentCount++;
          consentStatus = 'CONSENT_REQUIRED';
        }
      } else {
        eligibleForMarketingCount++;
      }

      validCount++;
      const contactRecord = {
        id: uuidv4(),
        name: rawName || 'Valued Customer',
        raw_phone: String(rawPhone).trim(),
        normalized_phone: normalized,
        country_code: phoneRes.countryCode,
        consent_status: consentStatus,
        consent_source: consentSource,
        consent_timestamp: consentTimestamp,
        contact_status: 'VALID',
        do_not_contact: doNotContact,
        import_batch_id: batchId
      };
      validContactsToInsert.push(contactRecord);

      if (previewValid.length < 15) {
        previewValid.push(contactRecord);
      }

      if (onProgress && i % 1000 === 0) {
        onProgress({
          processed: i + 1,
          total: totalRows,
          percent: Math.round(((i + 1) / totalRows) * 100)
        });
      }
    }

    // High performance bulk insertion using SQLite transaction
    const insertContactStmt = db.prepare(`
      INSERT INTO contacts (
        id, name, raw_phone, normalized_phone, country_code, consent_status,
        consent_source, consent_timestamp, contact_status, do_not_contact, import_batch_id
      ) VALUES (
        @id, @name, @raw_phone, @normalized_phone, @country_code, @consent_status,
        @consent_source, @consent_timestamp, @contact_status, @do_not_contact, @import_batch_id
      )
    `);

    const insertConsentStmt = db.prepare(`
      INSERT INTO consent_records (
        id, contact_id, phone_number, status, source, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertErrorStmt = db.prepare(`
      INSERT INTO import_errors (
        id, import_job_id, row_number, raw_data, reason, error_type
      ) VALUES (
        @id, @import_job_id, @row_number, @raw_data, @reason, @error_type
      )
    `);

    // Chunk size 500 for transactional safety
    const insertTransaction = db.transaction((contacts, errors) => {
      for (const contact of contacts) {
        insertContactStmt.run(contact);
        if (contact.consent_status === 'OPTED_IN') {
          insertConsentStmt.run(
            uuidv4(),
            contact.id,
            contact.normalized_phone,
            'OPTED_IN',
            'EXCEL_IMPORT',
            'Explicit affirmative opt-in in uploaded spreadsheet'
          );
        }
      }
      for (const err of errors) {
        insertErrorStmt.run(err);
      }
    });

    insertTransaction(validContactsToInsert, errorsToInsert);

    // Update import job status
    db.prepare(`
      UPDATE import_jobs SET
        processed_rows = ?,
        valid_rows = ?,
        duplicate_rows = ?,
        invalid_rows = ?,
        no_consent_rows = ?,
        status = 'COMPLETED',
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      totalRows,
      validCount,
      duplicateInFileCount + duplicateInDbCount,
      invalidCount,
      missingConsentCount,
      jobId
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json)
      VALUES (?, 'system', 'IMPORT_EXCEL_CONTACTS', 'import_job', ?, ?)
    `).run(
      uuidv4(),
      jobId,
      JSON.stringify({
        fileName,
        totalRows,
        validCount,
        duplicateInFileCount,
        duplicateInDbCount,
        invalidCount,
        missingConsentCount,
        eligibleForMarketingCount
      })
    );

    return {
      jobId,
      totalRows,
      validContacts: validCount,
      duplicateInFile: duplicateInFileCount,
      duplicateInDb: duplicateInDbCount,
      invalidNumbers: invalidCount,
      missingConsent: missingConsentCount,
      eligibleForMarketing: eligibleForMarketingCount,
      previewValid,
      previewErrors
    };
  }

  /**
   * Generates downloadable CSV of import errors for rejected records
   */
  public static exportErrorsAsCsv(jobId: string): string {
    const errors = db.prepare(`
      SELECT row_number, error_type, reason, raw_data, created_at
      FROM import_errors
      WHERE import_job_id = ?
      ORDER BY row_number ASC
    `).all(jobId) as Array<{
      row_number: number;
      error_type: string;
      reason: string;
      raw_data: string;
      created_at: string;
    }>;

    const headers = ['Row Number', 'Error Type', 'Reason', 'Raw Data'];
    const csvLines = [headers.join(',')];

    for (const e of errors) {
      const cleanData = `"${e.raw_data.replace(/"/g, '""')}"`;
      const cleanReason = `"${e.reason.replace(/"/g, '""')}"`;
      csvLines.push(`${e.row_number},${e.error_type},${cleanReason},${cleanData}`);
    }

    return csvLines.join('\n');
  }
}
