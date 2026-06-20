import { Router } from 'express';
import { apiKeyAuth } from '../middleware/api-key-auth';
import { orchestrateCampaign } from '../services/campaign-orchestrator';
import { CampaignSpecSchema } from '../platforms/meta/types';
import { getCampaignStatus } from '../platforms/meta/insights';
import { getTiktokCampaignStatus } from '../platforms/tiktok/status';
import { supabase } from '../db/supabase';
import { logger } from '../lib/logger';
import { AppError } from '../lib/errors';

const router = Router();
router.use(apiKeyAuth);

/**
 * POST /api/v1/campaigns — create the full lead-gen chain on the requested
 * platform(s). Response: { dbCampaignId, results: { meta?, tiktok? } }.
 */
router.post('/', async (req, res) => {
  const parsed = CampaignSpecSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_input',
      message: 'Campaign spec validation failed',
      details: parsed.error.issues,
    });
  }

  try {
    const result = await orchestrateCampaign(parsed.data);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json(err.toJSON());
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('campaigns.create.error', { message });
    return res.status(500).json({ error: 'orchestration_failed', message });
  }
});

/** GET /api/v1/campaigns — list recent campaigns from Supabase. */
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  return res.json({ campaigns: data });
});

/** GET /api/v1/campaigns/:id — single campaign with its creatives. */
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('*, ad_creatives(*)')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
  return res.json({ campaign: data });
});

/**
 * GET /api/v1/campaigns/:id/status — live delivery status across whichever
 * platforms the campaign used. Aggregates spend/impressions/clicks (currently
 * zeroed: per-platform insights are stubs until the metrics PR).
 */
router.get('/:id/status', async (req, res) => {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('id, platforms, meta_campaign_id, tiktok_campaign_id')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });

  if (!data.meta_campaign_id && !data.tiktok_campaign_id) {
    return res
      .status(409)
      .json({ error: 'no_platform_campaign', message: 'Campaign has no platform campaign ID' });
  }

  try {
    const platforms: Record<string, unknown> = {};
    if (data.meta_campaign_id) {
      platforms.meta = await getCampaignStatus(data.meta_campaign_id as string);
    }
    if (data.tiktok_campaign_id) {
      platforms.tiktok = await getTiktokCampaignStatus(data.tiktok_campaign_id as string);
    }
    return res.json({
      campaignId: req.params.id,
      platforms,
      aggregate: { spend: 0, impressions: 0, clicks: 0 },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json(err.toJSON());
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: 'status_fetch_failed', message });
  }
});

export default router;
