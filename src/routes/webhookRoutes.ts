import { Router, Request, Response } from 'express';
import { WebhookService } from '../services/webhookService';
import { config } from '../config/env';

const router = Router();

// GET /webhook - Meta Webhook Verification Handshake
router.get('/', (req: Request, res: Response): any => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    console.log('[Webhook] Meta verification challenge succeeded.');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed. Invalid verify token:', token);
  return res.sendStatus(403);
});

// POST /webhook - Ingest Meta Event Payloads
router.post('/', (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!WebhookService.verifySignature(rawBody, signature)) {
    console.warn('[Webhook] Rejected invalid HMAC signature.');
    return res.sendStatus(401);
  }

  try {
    WebhookService.processWebhookPayload(req.body);
  } catch (err) {
    console.error('[Webhook] Error processing event payload:', err);
  }

  // Meta requires immediate 200 OK
  return res.sendStatus(200);
});

// POST /webhook/simulate - For testing delivery/read receipts & STOP opt-outs
router.post('/simulate', (req: Request, res: Response) => {
  const { eventType, wamid, fromPhone, textContent } = req.body;

  if (eventType === 'DELIVERED' || eventType === 'READ') {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: wamid,
                    status: eventType.toLowerCase(),
                    timestamp: Math.floor(Date.now() / 1000).toString()
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    WebhookService.processWebhookPayload(payload);
    return res.json({ success: true, message: `Simulated ${eventType} for ${wamid}` });
  } else if (eventType === 'INBOUND_MESSAGE') {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ profile: { name: 'Customer' }, wa_id: fromPhone }],
                messages: [
                  {
                    from: fromPhone,
                    id: `wamid.SIM${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: { body: textContent || 'Hello' }
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    WebhookService.processWebhookPayload(payload);
    return res.json({ success: true, message: `Simulated inbound message from ${fromPhone}` });
  }

  return res.status(400).json({ error: 'Invalid simulation event type.' });
});

export default router;
