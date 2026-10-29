import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { initDatabase } from './db/database';
import { QueueService } from './services/queueService';

import authRoutes from './routes/authRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import importRoutes from './routes/importRoutes';
import contactRoutes from './routes/contactRoutes';
import templateRoutes from './routes/templateRoutes';
import campaignRoutes from './routes/campaignRoutes';
import conversationRoutes from './routes/conversationRoutes';
import reportRoutes from './routes/reportRoutes';
import webhookRoutes from './routes/webhookRoutes';
import groupRoutes from './routes/groupRoutes';
import telegramRoutes from './routes/telegramRoutes';
import { TelegramService } from './services/telegramService';

// Global error handlers to prevent Baileys socket timeouts from killing the Node process
process.on('unhandledRejection', (reason: any) => {
  console.warn('[Process] Caught unhandled rejection (prevented crash):', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('[Process] Caught uncaught exception (prevented crash):', err?.message || err);
});

const app = express();

// Capture raw body for webhook HMAC validation
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
    limit: '50mb'
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256']
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'DLB AUTO MARKETING',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/import', importRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/webhook', webhookRoutes);

// In production, serve built frontend
const frontendDist = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) {
      // If frontend isn't built yet, return informative status
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>DLB AUTO MARKETING API</title></head>
        <body style="font-family:sans-serif;padding:40px;text-align:center;background:#0f172a;color:#f8fafc;">
          <h1>DLB AUTO MARKETING Server is Running</h1>
          <p>Backend API is active on port ${config.port}. Run frontend dev server at <code>http://localhost:5173</code></p>
        </body>
        </html>
      `);
    }
  });
});

import { BaileysService } from './services/baileysService';

// Initialize database, background queue worker & WhatsApp/Telegram sessions
initDatabase();
QueueService.initQueueWorker();
BaileysService.init();
TelegramService.init();

app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🚀 DLB AUTO MARKETING Backend running on port ${config.port}`);
  console.log(`🔗 Webhook endpoint: http://localhost:${config.port}/webhook`);
  console.log(`📡 Health check:     http://localhost:${config.port}/api/health`);
  console.log(`====================================================`);
});
