import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ExcelImportService } from '../services/excelImportService';
import { db } from '../db/database';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit to easily handle 50,000+ rows
});

// POST /api/import/inspect - Upload file and inspect sheets + preview
router.post('/inspect', upload.single('file'), (req: Request, res: Response): any => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    const sheetInfo = ExcelImportService.inspectWorkbook(req.file.buffer);
    return res.json({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      ...sheetInfo
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to inspect workbook.' });
  }
});

// POST /api/import/sheet - Inspect specific sheet in uploaded file
router.post('/sheet', upload.single('file'), (req: Request, res: Response): any => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const sheetName = req.body.sheetName;
  if (!sheetName) {
    return res.status(400).json({ error: 'Sheet name required.' });
  }

  try {
    const sheetData = ExcelImportService.inspectSheet(req.file.buffer, sheetName);
    return res.json(sheetData);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to inspect sheet.' });
  }
});

// POST /api/import/execute - Execute full streaming import with validation
router.post('/execute', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const sheetName = req.body.sheetName;
  const nameColumn = req.body.nameColumn;
  const phoneColumn = req.body.phoneColumn;
  const consentColumn = req.body.consentColumn;
  const defaultCountryCode = req.body.defaultCountryCode || '91';

  if (!phoneColumn) {
    return res.status(400).json({ error: 'Mobile number column mapping is required.' });
  }

  try {
    const summary = await ExcelImportService.processImport(
      req.file.buffer,
      sheetName || 'Sheet1',
      { nameColumn, phoneColumn, consentColumn },
      defaultCountryCode,
      req.file.originalname
    );

    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to process import.' });
  }
});

// GET /api/import/errors/:jobId - Download rejected records CSV
router.get('/errors/:jobId', (req: Request, res: Response): any => {
  const jobId = req.params.jobId as string;
  try {
    const csvData = ExcelImportService.exportErrorsAsCsv(jobId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="import_rejected_records_${jobId.slice(0, 8)}.csv"`);
    return res.send(csvData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate error report.' });
  }
});

// GET /api/import/history - List previous import jobs
router.get('/history', (req: Request, res: Response) => {
  const jobs = db.prepare(`
    SELECT * FROM import_jobs
    ORDER BY started_at DESC
    LIMIT 20
  `).all();
  res.json({ jobs });
});

// GET /api/import/template - Download sample Excel template
router.get('/template', (req: Request, res: Response) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();

  const sampleData = [
    {
      'Name': 'Rahul Sharma',
      'Mobile Number': '919876543210',
      'WhatsApp Opt-in': 'Yes',
      'Consent Source': 'Showroom Visit',
      'Consent Date': '2026-10-15'
    },
    {
      'Name': 'Amit Patel',
      'Mobile Number': '919812345678',
      'WhatsApp Opt-in': 'Yes',
      'Consent Source': 'Website Inquiry',
      'Consent Date': '2026-10-20'
    },
    {
      'Name': 'Neha Shah',
      'Mobile Number': '919700000000',
      'WhatsApp Opt-in': 'No',
      'Consent Source': 'Cold Contact',
      'Consent Date': '2026-10-22'
    },
    {
      'Name': 'Vikram Singh',
      'Mobile Number': '9876500001',
      'WhatsApp Opt-in': 'Yes',
      'Consent Source': 'Service Booking',
      'Consent Date': '2026-10-25'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts Template');

  const instructions = [
    { 'DLB AUTO MARKETING': 'EXCEL IMPORT INSTRUCTIONS' },
    { 'DLB AUTO MARKETING': '1. Column "Mobile Number" is required.' },
    { 'DLB AUTO MARKETING': '2. 10-digit Indian numbers without country code will be normalized with +91.' },
    { 'DLB AUTO MARKETING': '3. Column "WhatsApp Opt-in" must be "Yes" or "True" for promotional messages.' },
    { 'DLB AUTO MARKETING': '4. Contacts with "No" or empty consent will be tagged as CONSENT REQUIRED.' },
    { 'DLB AUTO MARKETING': '5. Duplicate numbers will be identified and deduplicated automatically.' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Guide');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="DLB_Auto_Marketing_Template.xlsx"');
  res.send(buffer);
});

export default router;
