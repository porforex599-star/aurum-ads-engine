// Phase 1 · PR-1 · Webhook routes, mounted at /api/v1/webhooks/*.
//
// These routes are NOT behind apiKeyAuth — they authenticate via per-platform
// HMAC signatures instead (see src/webhooks/signature.ts). The raw body parser
// is mounted at the app level (server.ts) so signatures verify against the exact
// bytes Meta/TikTok signed.

import { Request, Response, Router } from 'express';
import { logger } from '../lib/logger';
import { getWebhookConfig } from '../webhooks/config';
import { metaReceive, metaVerify } from '../webhooks/meta-leads';
import { tiktokReceive } from '../webhooks/tiktok-leads';
import { persistLead } from '../webhooks/persist';
import { notifyNewLead } from '../webhooks/notify';
import { asBuffer, errMessage } from '../webhooks/util';
import { LeadPlatform, NormalizedLead } from '../webhooks/types';

const router = Router();

// Meta (Facebook Lead Ads)
router.get('/meta-leads', metaVerify);
router.post('/meta-leads', metaReceive);

// TikTok Lead Generation
router.post('/tiktok-leads', tiktokReceive);

/**
 * POST /test — mock-mode only. Inject a synthetic lead end-to-end (persist +
 * notify) for local testing without a real Meta/TikTok subscription.
 *
 * Body: { platform?: 'meta'|'tiktok', leadId?, adId?, campaignId?, formId?,
 *         email?, phone?, display_name? }
 *
 * The human label mirrors what real callers send: display_name, falling back
 * through full_name (Meta lead forms) and name (TikTok). The legacy `name`
 * alias is still accepted.
 */
async function testReceive(req: Request, res: Response): Promise<Response> {
  const cfg = getWebhookConfig();
  if (!cfg.mockMode) {
    return res.status(403).json({ error: 'mock_mode_only' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(asBuffer(req.body).toString('utf8') || '{}');
  } catch (err) {
    return res.status(400).json({ error: 'invalid_json', message: errMessage(err) });
  }

  const platform: LeadPlatform = payload.platform === 'tiktok' ? 'tiktok' : 'meta';
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  // Human label: real callers send display_name; Meta lead forms use full_name
  // and TikTok uses name. Fall through display_name || full_name || name || null.
  const displayName =
    str(payload.display_name) ?? str(payload.full_name) ?? str(payload.name);
  // Attribution id: real callers send platformCampaignId (matched against the
  // per-platform ad_campaigns id column). `campaignId` is the legacy alias.
  const platformCampaignId =
    str(payload.platformCampaignId) ?? str(payload.campaignId) ?? '';

  const lead: NormalizedLead = {
    platform,
    platformLeadId: str(payload.leadId) ?? `test_${Date.now()}`,
    platformAdId: str(payload.adId) ?? '',
    platformCampaignId,
    platformFormId: str(payload.formId) ?? '',
    email: str(payload.email),
    phone: str(payload.phone),
    displayName,
    utm: {
      source: platform === 'meta' ? 'facebook' : 'tiktok',
      medium: 'paid_social',
      campaign: platformCampaignId,
    },
    rawPayload: payload,
    receivedAt: new Date(),
  };

  try {
    const { leadId, isNew, sourceCampaignId } = await persistLead(lead);
    void notifyNewLead(lead, leadId, isNew);
    return res.status(200).json({
      ok: true,
      lead_id: leadId,
      leadId,
      isNew,
      display_name: lead.displayName ?? null,
      source_campaign_id: sourceCampaignId,
    });
  } catch (err) {
    logger.error('webhook.test.error', { message: errMessage(err) });
    return res.status(200).json({ ok: false, message: errMessage(err) });
  }
}

router.post('/test', testReceive);

export default router;
