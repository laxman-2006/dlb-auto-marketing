# DLB AUTO MARKETING

### Production-Ready WhatsApp Marketing Management Application

**DLB AUTO MARKETING** is an enterprise-grade WhatsApp Marketing Management Application built for automotive dealerships. It connects directly with the official Meta WhatsApp Business Platform (Cloud API), ingests high-volume customer lists (supporting 25,000+ contacts with sub-second streaming/chunked parsing), enforces strict opt-in consent and Do-Not-Contact compliance, executes template-based campaigns via a durable transactional background delivery queue, and ingests real-time delivery/read webhooks and customer replies with 24-hour service window tracking.

---

## 1. Key Features

- **Official Meta WhatsApp Cloud API Integration**:
  - Embedded Signup & credential vault with token encryption and masking.
  - Live diagnostic health-check tool to verify phone number registration, WABA ID, quality rating, and daily messaging tier.
  - Authorized test message dispatcher to verify live delivery on physical devices.
- **High-Volume Excel & CSV Import Engine**:
  - Tested with **20,000+ to 25,000+ rows** at **~15,000 rows/second**.
  - Dynamic sheet picker and column mapping (Customer Name, Mobile Number, WhatsApp Opt-In).
  - Automated E.164 phone normalization (India `+91` default & international format support).
  - Multi-tier duplicate detection (in-file deduplication + database uniqueness constraint).
  - Rejection categorization (malformed numbers, missing consent, duplicates) with downloadable CSV error report.
- **Compliance & Opt-In Enforcement**:
  - Segment filtering: *All Contacts*, *Eligible (Marketing Ready)*, *Consent Required*, *Do Not Contact / Opted Out*, *Invalid Numbers*.
  - Strict consent enforcement: contacts without verified affirmative consent are blocked from promotional campaigns.
  - Automated **STOP** opt-out processing: when a recipient texts "STOP", "UNSUBSCRIBE", or "DND", the contact is immediately marked as Do Not Contact and pending campaign messages are halted.
- **Guided Campaign Builder (10-Step Workflow)**:
  - Step-by-step wizard validating campaign name, authorized sender, Meta-approved template, audience segment, and deduplication keys.
  - Pre-flight recipient estimator and Meta conversation charge calculator (~₹0.78 / 24h conversation in India).
  - Idempotency key protection preventing duplicate sends during network retries or repeat clicks.
  - Real-time campaign queue controls: **Pause**, **Resume**, and **Cancel**.
- **Durable Background Message Delivery Queue**:
  - Concurrency control and rate limiting within Meta account tier limits.
  - Crash recovery on server restart: uncompleted jobs resume automatically without duplicate deliveries.
  - Full audit ledger tracking per-recipient submission, acceptance, delivery, and read timestamps.
- **2-Way Conversations & Customer Service Window**:
  - WhatsApp Web-inspired interface displaying active chats, message history, and ticks (sent, delivered, read).
  - **24-Hour Customer Service Window Countdown**: allows freeform customer replies within 24h; enforces approved template re-engagement after window expiry.
- **Real-Time Analytics & CSV Export**:
  - Aggregated metrics: Recipients Selected, Queued, Accepted by Provider, Sent, Delivered, Read, Failed, and Opt-Outs.
  - Delivery rate (%) and Read rate (%) based strictly on provider webhooks.
  - Export full campaign ledger to CSV.

---

## 2. Meta Setup & Credentials Guide

### Step 1: Meta for Developers Account
1. Visit [developers.facebook.com](https://developers.facebook.com/) and log in with your Facebook account.
2. Go to **My Apps** &gt; **Create App** &gt; Select **Business** as the App Type.
3. In the App Dashboard, find **WhatsApp** under *Add products to your app* and click **Set up**.

### Step 2: Meta Business Account & Phone Number
1. Navigate to **WhatsApp** &gt; **API Setup**.
2. Meta provides a temporary test phone number and test tokens.
3. To add your official DLB AUTO dealership phone number:
   - Ensure the number is **not currently active** on the WhatsApp consumer app or personal WhatsApp Business app (or migrate it).
   - Click **Add phone number**, enter display name (`DLB AUTO MARKETING`), category, and complete OTP verification.

### Step 3: Permanent System User Access Token
1. Go to **Meta Business Settings** (`business.facebook.com/settings`) &gt; **Users** &gt; **System Users**.
2. Click **Add** &gt; Name it `dlb-auto-system-user` &gt; Role: **Admin**.
3. Click **Generate New Token** &gt; Select your App &gt; Select expiration: **Never**.
4. Check required permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copy the generated permanent token and save it to your `.env` file as `META_SYSTEM_USER_TOKEN`.

### Step 4: Webhook Handshake Configuration
1. In Meta App Dashboard &gt; **WhatsApp** &gt; **Configuration** &gt; **Webhook**.
2. Click **Edit**:
   - **Callback URL**: `https://your-domain.com/webhook`
   - **Verify Token**: `dlb_webhook_token_secure_2026` (or the token specified in `.env`)
3. Click **Verify and Save**.
4. Under **Webhook fields**, click **Manage** and subscribe to:
   - `messages` (for inbound replies and STOP opt-outs)
   - `statuses` (for delivery and read receipts)

---

## 3. Meta Messaging Pricing Structure

Meta charges per 24-hour conversation window based on category:

| Category | Typical Rates (India) | Description |
|---|---|---|
| **Marketing** | ~₹0.78 - ₹0.85 | Outbound promotional campaigns, seasonal offers, inventory alerts |
| **Utility** | ~₹0.12 - ₹0.15 | Order updates, account receipts, service reminders |
| **Service (Inbound)** | Free 1,000 / mo, then ~₹0.30 | Customer-initiated inquiries & chat replies |

---

## 4. Local Quick Start & Running the Project

### Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)

### Installation
```bash
# Clone or navigate to the project directory
cd "DLB AUTO MARKETING"

# Install backend dependencies
npm install

# Install frontend dependencies
npm --prefix frontend install
```

### Running the Application

```bash
# Build frontend bundle
npm --prefix frontend run build

# Start the full-stack server (Serves UI + APIs on port 3001)
npm run start:backend
```

Open your browser at:
`http://localhost:3001`

### Running in Development Mode with Live Reload
```bash
# Terminal 1: Backend with watcher
npm run dev:backend

# Terminal 2: Frontend Vite dev server (proxies API to port 3001)
npm run dev:frontend
```
Development frontend runs at `http://localhost:5173`.

---

## 5. Automated Testing

Run the full end-to-end integration test suite verifying all 15 core requirements:
```bash
npm test
```

### Test Suite Coverage:
1. **Phone Normalizer**: E.164 normalization, India +91 mobile validation, invalid format detection.
2. **Consent Normalizer**: Affirmative ("Yes", "1", "Opt-in") vs negative ("No", "DND").
3. **High-Volume Excel Import**: Streaming ingestion of **20,000+ rows** in **~1.3 seconds** with in-file duplicate detection, DB duplicate detection, and invalid number identification.
4. **WhatsApp Connection Verification**: Live Meta Graph API health check.
5. **Template Enforcement**: Rejection of unapproved templates for marketing broadcasts.
6. **Audience Filtering**: Strict exclusion of non-consented contacts from marketing audiences.
7. **Queue Deduplication**: Hash-based idempotency keys preventing duplicate sends.
8. **Campaign Controls**: Pause, resume, and cancellation of pending queue messages.
9. **Webhook Status Processing**: Ingestion of delivery and read events.
10. **Automated Opt-Out**: Immediate "STOP" detection, DNC tagging, and campaign cancellation.
11. **Security**: Token masking and encryption (never returned raw to client).

---

## 6. Architecture & Technology Stack

- **Backend**: Node.js, Express, TypeScript, `better-sqlite3` (WAL mode enabled for high-concurrency 25k+ record queries).
- **Frontend**: React 19, TypeScript, Vite, Lucide Icons, pure custom CSS design system.
- **Queue**: Durable SQLite-backed transactional queue with concurrency controls, exponential backoff retries, and server restart recovery.
- **Security**: Password hashing with `bcryptjs`, JWT session tokens, HMAC-SHA256 signature verification for Meta webhooks (`X-Hub-Signature-256`), and credentials masking.
