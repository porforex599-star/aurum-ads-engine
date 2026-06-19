import { Router } from 'express';
import { apiKeyAuth } from '../middleware/api-key-auth';
import { orchestrateCampaign } from '../services/campaign-orchestrator';
import { CampaignSpecSchema } from '../platforms/meta/types';
import { getCampaignStatus } from '../platforms/meta/insights';
import { supabase } from '../db/supabase';
import { logger } from '../lib/logger';
import { AppError } from '../lib/errors';

const router = Router();
router.use(apiKeyAuth);

/** POST /api/v1/campaigns — create the full Meta lead-gen chain. */
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

/** GET /api/v1/campaigns/:id/status — live Meta delivery status. */
router.get('/:id/status', async (req, res) => {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('id, meta_campaign_id')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
  if (!data.meta_campaign_id) {
    return res.status(409).json({ error: 'no_meta_campaign', message: 'Campaign has no Meta campaign ID' });
  }

  try {
    const status = await getCampaignStatus(data.meta_campaign_id as string);
    return res.json({ campaignId: req.params.id, metaCampaignId: data.meta_campaign_id, ...status });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json(err.toJSON());
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: 'status_fetch_failed', message });
  }
});

export default router;
