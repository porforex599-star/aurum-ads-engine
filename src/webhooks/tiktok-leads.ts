// Phase 1 · PR-1 · TikTok Lead Generation webhook handler.
//   POST /tiktok-leads → lead receipt (verify sig → normalize → persist → notify)
//
// No GET handshake (TikTok subscriptions are configured in Business Center).
// The payload contains the full lead inline, so no second API call is needed.
// Always responds 200 except on signature failure (401).

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { getWebhookConfig } from './config';
import { verifyTiktokSignature } from './signature';
import { normalizeTiktokLead } from './normalize';
import { persistLead } from './persist';
import { notifyNewLead } from './notify';
import { asBuffer, errMessage } from './util';
import { TiktokWebhookBody } from './types';

export async function tiktokReceive(req: Request, res: Response): Promise<Response> {
  const cfg = getWebhookConfig();
  const rawBody = asBuffer(req.body);

  if (!cfg.mockMode) {
    const signature = req.header('x-tt-signature');
    if (!verifyTiktokSignature(rawBody, signature, cfg.tiktokSecret)) {
      logger.warn('webhook.tiktok.bad_signature');
      return res.status(401).json({ error: 'invalid_signature' });
    }
  }

  let body: TiktokWebhookBody;
  try {
    body = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (err) {
    logger.error('webhook.tiktok.bad_json', { message: errMessage(err) });
    return res.status(200).json({ received: true });
  }

  try {
    if (body.event_type && body.event_type !== 'LEAD_FORM_SUBMIT') {
      logger.info('webhook.tiktok.ignored_event', { eventType: body.event_type });
      return res.status(200).json({ received: true });
    }

    const lead = normalizeTiktokLead(body);
    if (!lead.platformLeadId) {
      logger.warn('webhook.tiktok.missing_lead_id');
      return res.status(200).json({ received: true });
    }

    const { leadId, isNew } = await persistLead(lead);
    logger.info('webhook.tiktok.lead_processed', { leadId, isNew });

    // Fire-and-forget: never block the 200 on notification latency.
    void notifyNewLead(lead, leadId, isNew);
  } catch (err) {
    logger.error('webhook.tiktok.process_error', { message: errMessage(err) });
  }

  return res.status(200).json({ received: true });
}
