// Phase 1 · PR-1 · Meta (Facebook Lead Ads) webhook handler.
//   GET  /meta-leads → verification challenge (hub.challenge echo)
//   POST /meta-leads → lead receipt (verify sig → fetch → persist → notify)
//
// Always responds 200 to POST except on signature failure (401): Meta retries
// indefinitely on non-200, so internal errors are logged and swallowed.

import { Request, Response } from 'express';
import { logger, sanitize } from '../lib/logger';
import { getWebhookConfig } from './config';
import { verifyMetaSignature } from './signature';
import { normalizeMetaLead } from './normalize';
import { persistLead } from './persist';
import { notifyNewLead } from './notify';
import { asBuffer, errMessage } from './util';
import { MetaWebhookBody } from './types';

/** GET handshake: echo hub.challenge when the verify token matches. */
export function metaVerify(req: Request, res: Response): Response {
  const cfg = getWebhookConfig();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && cfg.metaVerifyToken && token === cfg.metaVerifyToken) {
    logger.info('webhook.meta.verified');
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }

  logger.warn('webhook.meta.verify_failed', { mode, hasToken: Boolean(token) });
  return res.status(403).send('Forbidden');
}

async function processMetaBody(body: MetaWebhookBody, accessToken: string): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const value = change.value ?? {};
      const leadgenId = value.leadgen_id;
      if (!leadgenId) {
        logger.warn('webhook.meta.missing_leadgen_id', { value: sanitize(value) });
        continue;
      }

      // Meta only hands us a leadgen_id; we need the access token to fetch the
      // full lead. If it's missing/expired, log the id for manual retrieval.
      if (!accessToken) {
        logger.warn('webhook.meta.no_access_token', { leadgenId });
        continue;
      }

      try {
        const lead = await normalizeMetaLead(leadgenId, accessToken);
        // Backfill ids from the webhook envelope if the Graph response omitted them.
        if (!lead.platformAdId && value.ad_id) lead.platformAdId = value.ad_id;
        if (!lead.platformFormId && value.form_id) lead.platformFormId = value.form_id;

        const { leadId, isNew } = await persistLead(lead);
        logger.info('webhook.meta.lead_processed', { leadgenId, leadId, isNew });

        // Fire-and-forget: never block the 200 on notification latency.
        void notifyNewLead(lead, leadId, isNew);
      } catch (err) {
        logger.error('webhook.meta.lead_error', { leadgenId, message: errMessage(err) });
      }
    }
  }
}

/** POST receiver. */
export async function metaReceive(req: Request, res: Response): Promise<Response> {
  const cfg = getWebhookConfig();
  const rawBody = asBuffer(req.body);

  if (!cfg.mockMode) {
    const signature = req.header('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, signature, cfg.metaAppSecret)) {
      logger.warn('webhook.meta.bad_signature');
      return res.status(401).json({ error: 'invalid_signature' });
    }
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (err) {
    logger.error('webhook.meta.bad_json', { message: errMessage(err) });
    return res.status(200).send('EVENT_RECEIVED');
  }

  try {
    await processMetaBody(body, cfg.metaAccessToken);
  } catch (err) {
    // Defensive: never let a processing error become a non-200 (Meta retry storm).
    logger.error('webhook.meta.process_error', { message: errMessage(err) });
  }

  return res.status(200).send('EVENT_RECEIVED');
}
