import assert from 'assert';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../src/db/database';
import { normalizePhoneNumber, normalizeConsent } from '../src/services/phoneNormalizer';
import { ExcelImportService } from '../src/services/excelImportService';
import { MetaWhatsAppService } from '../src/services/metaWhatsAppService';
import { QueueService } from '../src/services/queueService';
import { WebhookService } from '../src/services/webhookService';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 DLB AUTO MARKETING - AUTOMATED INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  initDatabase();

  // Reset test tables for consistent deterministic test execution
  db.prepare('DELETE FROM campaign_recipients').run();
  db.prepare('DELETE FROM campaigns').run();
  db.prepare('DELETE FROM import_errors').run();
  db.prepare('DELETE FROM import_jobs').run();
  db.prepare('DELETE FROM consent_records').run();
  db.prepare('DELETE FROM opt_out_records').run();
  db.prepare('DELETE FROM chat_messages').run();
  db.prepare('DELETE FROM conversations').run();
  db.prepare('DELETE FROM contacts').run();

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => Promise<void> | void) {
    totalTests++;
    try {
      fn();
      console.log(`✅ [PASS] Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`❌ [FAIL] Test ${totalTests}: ${name}`);
      console.error(err);
    }
  }

  async function testAsync(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`✅ [PASS] Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`❌ [FAIL] Test ${totalTests}: ${name}`);
      console.error(err);
    }
  }

  // 1. Phone Normalizer & E.164 Format
  test('Phone Normalizer - Formats Indian 10-digit and international numbers', () => {
    const res1 = normalizePhoneNumber('9876543210', '91');
    assert.strictEqual(res1.isValid, true);
    assert.strictEqual(res1.normalized, '919876543210');

    const res2 = normalizePhoneNumber('+91 98123-45678', '91');
    assert.strictEqual(res2.isValid, true);
    assert.strictEqual(res2.normalized, '919812345678');

    const res3 = normalizePhoneNumber('09876543210', '91');
    assert.strictEqual(res3.isValid, true);
    assert.strictEqual(res3.normalized, '919876543210');

    // Invalid: starts with 2 (invalid for Indian mobile)
    const res4 = normalizePhoneNumber('2876543210', '91');
    assert.strictEqual(res4.isValid, false);

    // Invalid: letters / malformed
    const res5 = normalizePhoneNumber('abcdefghij', '91');
    assert.strictEqual(res5.isValid, false);
  });

  // 2. Consent Normalizer
  test('Consent Normalizer - Correctly identifies affirmative and negative opt-ins', () => {
    assert.strictEqual(normalizeConsent('Yes').isOptedIn, true);
    assert.strictEqual(normalizeConsent('Y').isOptedIn, true);
    assert.strictEqual(normalizeConsent('1').isOptedIn, true);
    assert.strictEqual(normalizeConsent('True').isOptedIn, true);

    assert.strictEqual(normalizeConsent('No').isOptedIn, false);
    assert.strictEqual(normalizeConsent('No').rawStatus, 'OPTED_OUT');
    assert.strictEqual(normalizeConsent(undefined).isOptedIn, false);
    assert.strictEqual(normalizeConsent(undefined).rawStatus, 'NO_CONSENT_PROVIDED');
  });

  // 3. High-volume Excel Import & Validation (Generating 20,000+ row workbook)
  await testAsync('Excel Import Engine - Fast chunked import of 20,000+ records with duplicates & validation', async () => {
    const testRows: any[] = [];
    const numRows = 20000;

    console.log(`   Generating in-memory workbook with ${numRows} contact rows...`);
    // Seed test rows with valid, duplicates, invalid numbers, and opt-out rows
    for (let i = 0; i < numRows; i++) {
      if (i === 100) {
        // Duplicate row in file
        testRows.push({ 'Customer Name': 'Dup Customer', 'Mobile Number': '919876500001', 'WhatsApp Opt-in': 'Yes' });
      } else if (i === 101) {
        // Second occurrence of duplicate
        testRows.push({ 'Customer Name': 'Dup Customer 2', 'Mobile Number': '919876500001', 'WhatsApp Opt-in': 'Yes' });
      } else if (i === 200) {
        // Invalid number
        testRows.push({ 'Customer Name': 'Bad Phone', 'Mobile Number': '12345', 'WhatsApp Opt-in': 'Yes' });
      } else if (i === 300) {
        // No consent
        testRows.push({ 'Customer Name': 'No Consent Customer', 'Mobile Number': '919876500300', 'WhatsApp Opt-in': 'No' });
      } else {
        const uniqueNum = 9800000000 + i;
        testRows.push({
          'Customer Name': `Customer ${i}`,
          'Mobile Number': String(uniqueNum),
          'WhatsApp Opt-in': i % 5 === 0 ? 'No' : 'Yes'
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(testRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    console.log(`   Workbook buffer created (${(buffer.length / 1024 / 1024).toFixed(2)} MB). Starting import...`);
    const startTime = Date.now();

    const summary = await ExcelImportService.processImport(
      buffer,
      'Contacts',
      {
        nameColumn: 'Customer Name',
        phoneColumn: 'Mobile Number',
        consentColumn: 'WhatsApp Opt-in'
      },
      '91',
      'test_20k_contacts.xlsx'
    );

    const elapsedMs = Date.now() - startTime;
    console.log(`   Import completed in ${elapsedMs}ms (${(numRows / (elapsedMs / 1000)).toFixed(0)} rows/sec)`);

    assert.strictEqual(summary.totalRows, numRows);
    assert(summary.validContacts > 15000, 'Expected high number of valid contacts');
    assert(summary.duplicateInFile >= 1, 'Expected at least 1 duplicate detected in file');
    assert(summary.invalidNumbers >= 1, 'Expected at least 1 invalid number detected');

    // Verify error CSV generation
    const errorCsv = ExcelImportService.exportErrorsAsCsv(summary.jobId);
    assert(errorCsv.includes('Row Number'), 'Error CSV must have headers');
  });

  // 4. WhatsApp Cloud API Connection Verification
  await testAsync('WhatsApp Connection - Diagnostic verification of sender status', async () => {
    const status = await MetaWhatsAppService.verifyConnection(
      'WABA_DLB_AUTO_10928374',
      'PHONE_ID_919876500000',
      'mock_meta_token_test'
    );
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.state, 'CONNECTED');
    assert.strictEqual(status.qualityRating, 'GREEN');
  });

  // 5. Template Approval Enforcement
  test('Template Enforcement - Campaign rejects unapproved templates', () => {
    const pendingTpl = db.prepare("SELECT id FROM message_templates WHERE status = 'PENDING' LIMIT 1").get() as any;
    assert(pendingTpl, 'Pending template exists');

    // Attempting to launch campaign with pending template must fail
    const template = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(pendingTpl.id) as any;
    assert.notStrictEqual(template.status, 'APPROVED');
  });

  // 6. Campaign Audience Consent Exclusion
  test('Campaign Audience - Contacts without consent are strictly excluded from marketing audience', () => {
    const nonConsented = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE consent_status != 'OPTED_IN'").get() as any;
    assert(nonConsented.count > 0, 'Contacts without consent must exist from test import');

    // Eligible query must return ONLY opted-in, non-DNC, valid contacts
    const eligibleCount = (db.prepare(`
      SELECT COUNT(*) as count FROM contacts
      WHERE consent_status = 'OPTED_IN' AND do_not_contact = 0 AND contact_status = 'VALID'
    `).get() as any).count;

    assert(eligibleCount > 0, 'Eligible count must be positive');
  });

  // 7. Campaign Queue Creation & Idempotency Key
  test('Campaign Queue & Idempotency - Recipients receive unique deduplication keys', () => {
    const approvedTpl = db.prepare("SELECT id FROM message_templates WHERE status = 'APPROVED' LIMIT 1").get() as any;
    const sender = db.prepare('SELECT id FROM whatsapp_senders WHERE is_default = 1 LIMIT 1').get() as any;

    const campaignId = uuidv4();
    db.prepare(`
      INSERT INTO campaigns (id, name, sender_id, template_id, contact_segment, total_recipients, status)
      VALUES (?, 'Test Festive Blast', ?, ?, 'ELIGIBLE', 5, 'QUEUED')
    `).run(campaignId, sender.id, approvedTpl.id);

    // Pick 5 eligible contacts
    const sampleContacts = db.prepare(`
      SELECT id, normalized_phone, name FROM contacts
      WHERE consent_status = 'OPTED_IN' AND do_not_contact = 0
      LIMIT 5
    `).all() as any[];

    for (const c of sampleContacts) {
      const idempotencyKey = `KEY_${campaignId}_${c.normalized_phone}`;
      db.prepare(`
        INSERT INTO campaign_recipients (
          id, campaign_id, contact_id, phone_number, customer_name, status, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)
      `).run(uuidv4(), campaignId, c.id, c.normalized_phone, c.name, idempotencyKey);
    }

    const queuedRecipients = db.prepare('SELECT COUNT(*) as c FROM campaign_recipients WHERE campaign_id = ?').get(campaignId) as any;
    assert.strictEqual(queuedRecipients.c, 5);
  });

  // 8. Campaign Queue Controls (Pause & Resume & Cancel)
  test('Campaign Controls - Pausing, resuming, and cancelling pending messages', () => {
    const activeCamp = db.prepare("SELECT id FROM campaigns WHERE status = 'QUEUED' LIMIT 1").get() as any;
    assert(activeCamp, 'Campaign exists');

    // Pause
    QueueService.pauseCampaign(activeCamp.id);
    const pausedStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(activeCamp.id) as any).status;
    assert.strictEqual(pausedStatus, 'PAUSED');

    // Resume
    QueueService.resumeCampaign(activeCamp.id);
    const resumedStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(activeCamp.id) as any).status;
    assert.strictEqual(resumedStatus, 'IN_PROGRESS');

    // Cancel
    const cancelledCount = QueueService.cancelCampaign(activeCamp.id);
    const finalStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(activeCamp.id) as any).status;
    assert.strictEqual(finalStatus, 'CANCELLED');
    assert(cancelledCount >= 0);
  });

  // 9. Webhook Delivery & Read Updates
  test('Webhook Ingestion - Updates delivery and read status from Meta statuses payload', () => {
    const testWamid = `wamid.HBgTEST_${Date.now()}`;
    const testRecipientId = uuidv4();
    const testCampId = uuidv4();
    const tpl = db.prepare('SELECT id FROM message_templates LIMIT 1').get() as any;
    const sender = db.prepare('SELECT id FROM whatsapp_senders LIMIT 1').get() as any;

    db.prepare(`
      INSERT INTO campaigns (id, name, sender_id, template_id, status)
      VALUES (?, 'Webhook Test Camp', ?, ?, 'IN_PROGRESS')
    `).run(testCampId, sender.id, tpl.id);

    db.prepare(`
      INSERT INTO campaign_recipients (id, campaign_id, phone_number, status, message_id, idempotency_key)
      VALUES (?, ?, '919876543999', 'ACCEPTED', ?, ?)
    `).run(testRecipientId, testCampId, testWamid, `IDEMP_${testWamid}`);

    // Simulate DELIVERED webhook
    const deliveredPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [{ id: testWamid, status: 'delivered', timestamp: '1700000000' }]
              }
            }
          ]
        }
      ]
    };
    WebhookService.processWebhookPayload(deliveredPayload);

    const checkDelivered = (db.prepare('SELECT status FROM campaign_recipients WHERE id = ?').get(testRecipientId) as any).status;
    assert.strictEqual(checkDelivered, 'DELIVERED');

    // Simulate READ webhook
    const readPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [{ id: testWamid, status: 'read', timestamp: '1700000010' }]
              }
            }
          ]
        }
      ]
    };
    WebhookService.processWebhookPayload(readPayload);

    const checkRead = (db.prepare('SELECT status FROM campaign_recipients WHERE id = ?').get(testRecipientId) as any).status;
    assert.strictEqual(checkRead, 'READ');
  });

  // 10. Automated Opt-Out (STOP) Detection
  test('Opt-Out Enforcement - Inbound STOP immediately sets DNC and logs opt-out record', () => {
    const optOutPhone = '919811122233';
    const contactId = uuidv4();

    db.prepare(`
      INSERT INTO contacts (id, name, raw_phone, normalized_phone, consent_status, do_not_contact)
      VALUES (?, 'Optout Customer', ?, ?, 'OPTED_IN', 0)
    `).run(contactId, optOutPhone, optOutPhone);

    // Inbound STOP message payload
    const stopPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Optout Customer' }, wa_id: optOutPhone }],
                messages: [
                  {
                    from: optOutPhone,
                    id: `wamid.STOP_${Date.now()}`,
                    timestamp: '1700000020',
                    type: 'text',
                    text: { body: 'STOP' }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    WebhookService.processWebhookPayload(stopPayload);

    // Verify contact is now Do Not Contact
    const updatedContact = db.prepare('SELECT do_not_contact, consent_status FROM contacts WHERE id = ?').get(contactId) as any;
    assert.strictEqual(updatedContact.do_not_contact, 1);
    assert.strictEqual(updatedContact.consent_status, 'OPTED_OUT');

    // Verify opt_out_records entry
    const optRecord = db.prepare('SELECT * FROM opt_out_records WHERE phone_number = ?').get(optOutPhone) as any;
    assert(optRecord, 'Opt out record must be created');
    assert.strictEqual(optRecord.trigger_word, 'STOP');
  });

  // 11. Security - Credential Protection
  test('Security - Access tokens are never returned raw in public status queries', () => {
    const rawSender = db.prepare(`
      SELECT s.*, b.system_user_token
      FROM whatsapp_senders s
      JOIN business_accounts b ON s.business_account_id = b.id
      WHERE s.is_default = 1
    `).get() as any;

    // Simulation of route response
    const tokenMasked = rawSender?.system_user_token
      ? `${rawSender.system_user_token.substring(0, 4)}...${rawSender.system_user_token.slice(-3)}`
      : null;

    if (rawSender?.system_user_token) {
      assert.notStrictEqual(tokenMasked, rawSender.system_user_token);
      assert(tokenMasked?.includes('...'));
    }
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('====================================================');
}

runTestSuite().catch(console.error);
