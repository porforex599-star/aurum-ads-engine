// Phase 1 · PR-1 · Insert a NormalizedLead into public.leads.
//
// Idempotent: the same platform lead id arriving twice returns the existing
// row instead of inserting a duplicate (webhooks retry on non-200). A pre-check
// SELECT handles the common case; the unique index idx_leads_platform_lead_id
// is the race-condition backstop (Postgres error 23505).

import { supabase } from '../db/supabase';
import { logger } from '../lib/logger';
import { NormalizedLead } from './types';

/**
 * Map our internal platform to the DB `source_platform` CHECK value. The leads
 * table predates this PR and its CHECK has no 'meta' value — Meta lead-ads
 * originate on Facebook pages, so they are stored as 'facebook'.
 */
const PLATFORM_DB_VALUE: Record<NormalizedLead['platform'], string> = {
  meta: 'facebook',
  tiktok: 'tiktok',
};

type PostgrestErrorLike = { code?: string; message: string };

async function findExisting(
  sourcePlatform: string,
  platformLeadId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .eq('source_platform', sourcePlatform)
    .eq('tags->>source_lead_id', platformLeadId)
    .maybeSingle();
  if (error) {
    logger.warn('webhook.persist.dedup_lookup_error', { message: error.message });
    return null;
  }
  return data ? (data.id as string) : null;
}

/**
 * Resolve AURUM attribution from platform ids:
 *  - ad_id maps to ad_creatives (meta_ad_id / tiktok_ad_id) → gives both the
 *    creative id and its campaign_id.
 *  - campaign_id maps to ad_campaigns (meta_campaign_id / tiktok_campaign_id).
 * Either may be null when the ad was created outside the AURUM dashboard.
 */
async function resolveAttribution(
  lead: NormalizedLead
): Promise<{ campaignId: string | null; creativeId: string | null }> {
  const creativeAdCol = lead.platform === 'meta' ? 'meta_ad_id' : 'tiktok_ad_id';
  const campaignCol = lead.platform === 'meta' ? 'meta_campaign_id' : 'tiktok_campaign_id';

  if (lead.platformAdId) {
    const { data, error } = await supabase
      .from('ad_creatives')
      .select('id, campaign_id')
      .eq(creativeAdCol, lead.platformAdId)
      .maybeSingle();
    if (error) {
      logger.warn('webhook.persist.creative_lookup_error', { message: error.message });
    } else if (data) {
      return { campaignId: (data.campaign_id as string) ?? null, creativeId: (data.id as string) ?? null };
    }
  }

  if (lead.platformCampaignId) {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('id')
      .eq(campaignCol, lead.platformCampaignId)
      .maybeSingle();
    if (error) {
      logger.warn('webhook.persist.campaign_lookup_error', { message: error.message });
    } else if (data) {
      return { campaignId: (data.id as string) ?? null, creativeId: null };
    }
  }

  return { campaignId: null, creativeId: null };
}

export async function persistLead(
  lead: NormalizedLead
): Promise<{ leadId: string; isNew: boolean }> {
  const sourcePlatform = PLATFORM_DB_VALUE[lead.platform];

  // 1. Idempotency pre-check.
  if (lead.platformLeadId) {
    const existing = await findExisting(sourcePlatform, lead.platformLeadId);
    if (existing) {
      logger.info('webhook.persist.duplicate', { leadId: existing, platform: lead.platform });
      return { leadId: existing, isNew: false };
    }
  }

  // 2. Resolve campaign / creative attribution.
  const { campaignId, creativeId } = await resolveAttribution(lead);

  // 3. Insert. tags is an OBJECT (not array) so the unique index can key off
  //    tags->>'source_lead_id'. We intentionally avoid storing raw form field
  //    values here to keep PII ( id numbers, addresses) out of the JSONB blob.
  const now = new Date().toISOString();
  const row = {
    source_platform: sourcePlatform,
    source_campaign_id: campaignId,
    source_creative_id: creativeId,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    display_name: lead.displayName ?? null,
    status: 'new',
    tags: {
      source_lead_id: lead.platformLeadId,
      source_platform: lead.platform,
      ad_id: lead.platformAdId || null,
      form_id: lead.platformFormId || null,
    },
    utm_source: lead.utm.source || null,
    utm_medium: lead.utm.medium || null,
    utm_campaign: lead.utm.campaign || null,
    first_seen_at: now,
    last_interaction_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('leads').insert(row).select('id').single();

  if (error) {
    const pgErr = error as PostgrestErrorLike;
    // Concurrent duplicate — the unique index rejected the race loser.
    if (pgErr.code === '23505' && lead.platformLeadId) {
      const existing = await findExisting(sourcePlatform, lead.platformLeadId);
      if (existing) return { leadId: existing, isNew: false };
    }
    throw new Error(`Failed to persist lead: ${error.message}`);
  }

  logger.info('webhook.persist.inserted', {
    leadId: data.id,
    platform: lead.platform,
    sourceCampaignId: campaignId,
    sourceCreativeId: creativeId,
  });
  return { leadId: data.id as string, isNew: true };
}
