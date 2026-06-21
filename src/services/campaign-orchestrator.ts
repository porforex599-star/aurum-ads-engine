import { supabase } from '../db/supabase';
import { logger } from '../lib/logger';
import { MetaApiError, OrchestrationError } from '../lib/errors';
import { metaClient } from '../platforms/meta/client';
import { createMetaCampaign } from '../platforms/meta/campaigns';
import { createMetaAdSet } from '../platforms/meta/adsets';
import { createLeadGenForm } from '../platforms/meta/leadgen-forms';
import { uploadImage, createAdCreative } from '../platforms/meta/creatives';
import { createAd, deleteMetaNode } from '../platforms/meta/ads';
import { resolveInterests } from '../platforms/meta/targeting';
import { tiktokClient } from '../platforms/tiktok/client';
import { createTiktokCampaign } from '../platforms/tiktok/campaigns';
import { createTiktokAdGroup } from '../platforms/tiktok/adgroups';
import { createTiktokLeadForm } from '../platforms/tiktok/leadforms';
import { uploadTiktokImage, createTiktokAd, deleteTiktokNode } from '../platforms/tiktok/creatives';
import { buildTiktokTargeting } from '../platforms/tiktok/targeting';
import {
  CampaignSpec,
  MetaPlatformResult,
  MultiPlatformOrchestrationResult,
  PlatformResults,
  TiktokPlatformResult,
} from '../platforms/meta/types';

const RATE_LIMIT_DELAY_MS = 100;
const THAI_LOCALE = 6;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapGenders(genders?: ('male' | 'female')[]): number[] | undefined {
  if (!genders?.length) return undefined;
  return genders.map((g) => (g === 'male' ? 1 : 2));
}

// ---------------------------------------------------------------------------
// Per-platform persistence payloads (collected during orchestration).
// ---------------------------------------------------------------------------

interface MetaCreativeRow {
  meta_creative_id: string;
  meta_ad_id: string;
  image_hash: string;
  ad: CampaignSpec['ads'][number];
}

interface TiktokCreativeRow {
  tiktok_creative_id: string;
  tiktok_ad_id: string;
  ad: CampaignSpec['ads'][number];
}

interface MetaOutcome {
  result: MetaPlatformResult;
  interests: { id: string; name: string }[];
  creativeRows: MetaCreativeRow[];
  /** Best-effort undo of everything this platform created. */
  rollback: () => Promise<void>;
}

interface TiktokOutcome {
  result: TiktokPlatformResult;
  creativeRows: TiktokCreativeRow[];
  rollback: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Public entrypoint — dispatches by spec.platform and persists combined result.
// ---------------------------------------------------------------------------

/**
 * Orchestrate a (possibly multi-platform) lead-gen campaign from a high-level
 * spec. Each platform is built independently; all returned IDs are persisted to
 * a single ad_campaigns row plus per-platform ad_creatives rows.
 *
 * Partial-failure policy (matches Phase 2): if any platform fails, every
 * already-completed platform is rolled back best-effort and the error is
 * re-thrown — we never persist a half-built multi-platform campaign.
 */
export async function orchestrateCampaign(
  spec: CampaignSpec
): Promise<MultiPlatformOrchestrationResult> {
  const results: PlatformResults = {};
  const completedRollbacks: Array<() => Promise<void>> = [];
  let metaOutcome: MetaOutcome | undefined;
  let tiktokOutcome: TiktokOutcome | undefined;

  try {
    for (const platform of spec.platform) {
      if (platform === 'meta') {
        metaOutcome = await orchestrateMetaCampaign(spec);
        results.meta = metaOutcome.result;
        completedRollbacks.unshift(metaOutcome.rollback);
      } else if (platform === 'tiktok') {
        tiktokOutcome = await orchestrateTiktokCampaign(spec);
        results.tiktok = tiktokOutcome.result;
        completedRollbacks.unshift(tiktokOutcome.rollback);
      }
    }

    const dbCampaignId = await persistCampaign(spec, results, metaOutcome, tiktokOutcome);
    return { dbCampaignId, results };
  } catch (err) {
    // A platform that failed mid-build already rolled back its own nodes; here
    // we roll back the OTHER platform(s) that had completed successfully.
    await rollbackCompleted(completedRollbacks);
    const rolledBack = completedRollbacks.length;
    const message = err instanceof Error ? err.message : 'Unknown orchestration error';

    // Meta rejected the request upstream: keep the full Graph error so the route
    // can surface error_user_msg / fbtrace_id to the caller (the client wrapper
    // has already logged the structured `meta.error`).
    if (err instanceof MetaApiError) {
      logger.error('orchestrate.failed', {
        message,
        platforms: spec.platform,
        stepKey: err.stepKey,
        fbtraceId: err.fbtraceId,
        rolledBack,
      });
      throw new OrchestrationError(message, { rolledBack, metaError: err });
    }

    logger.error('orchestrate.failed', { message, platforms: spec.platform, rolledBack });
    if (err instanceof OrchestrationError) throw err;
    throw new OrchestrationError(message, { rolledBack });
  }
}

// ---------------------------------------------------------------------------
// Meta orchestration (extracted unchanged from Phase 2).
// ---------------------------------------------------------------------------

async function orchestrateMetaCampaign(spec: CampaignSpec): Promise<MetaOutcome> {
  const createdNodes: string[] = [];
  const status = spec.autoActivate ? 'ACTIVE' : 'PAUSED';

  try {
    const interests = await resolveInterests(spec.targeting.interests);
    await delay(RATE_LIMIT_DELAY_MS);

    // 1. Campaign (always created PAUSED first; activated at the end if requested).
    const campaign = await createMetaCampaign({ name: spec.name, status: 'PAUSED' });
    createdNodes.unshift(campaign.id);
    logger.info('orchestrate.meta.campaign.created', { campaignId: campaign.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 2. Ad set with targeting.
    const adSet = await createMetaAdSet({
      campaignId: campaign.id,
      name: `${spec.name} · AdSet`,
      dailyBudget: spec.dailyBudget,
      targeting: {
        geoLocations: { countries: spec.targeting.countries },
        ageMin: spec.targeting.ageMin,
        ageMax: spec.targeting.ageMax,
        genders: mapGenders(spec.targeting.genders),
        interests,
        locales: [THAI_LOCALE],
      },
      status: 'PAUSED',
      promotedObject: { pageId: metaClient.resolvedPageId },
      startTime: spec.schedule.startTime,
      endTime: spec.schedule.endTime,
    });
    createdNodes.unshift(adSet.id);
    logger.info('orchestrate.meta.adset.created', { adSetId: adSet.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 3. Lead-gen instant form.
    const form = await createLeadGenForm({
      name: `${spec.name} · Form`,
      pageId: metaClient.resolvedPageId,
      intro: { headline: spec.leadGenForm.headline, description: spec.leadGenForm.description },
      questions: [
        { type: 'FULL_NAME' },
        { type: 'PHONE' },
        { type: 'EMAIL' },
        ...(spec.leadGenForm.customQuestion
          ? [
              {
                type: 'CUSTOM' as const,
                key: 'custom_1',
                label: spec.leadGenForm.customQuestion.label,
                options: spec.leadGenForm.customQuestion.options.map((value, idx) => ({
                  value,
                  key: `opt_${idx}`,
                })),
              },
            ]
          : []),
      ],
      privacyPolicy: { url: spec.leadGenForm.privacyPolicyUrl, linkText: 'Privacy Policy' },
      thankYouPage: {
        title: spec.leadGenForm.thankYouTitle,
        body: spec.leadGenForm.thankYouBody,
        buttonText: spec.leadGenForm.thankYouButtonText,
        buttonUrl: spec.leadGenForm.thankYouButtonUrl,
      },
      locale: 'th_TH',
    });
    createdNodes.unshift(form.id);
    logger.info('orchestrate.meta.form.created', { leadGenFormId: form.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 4. Per ad: upload image → create creative → create ad.
    const ads: MetaPlatformResult['ads'] = [];
    const creativeRows: MetaCreativeRow[] = [];

    for (const adSpec of spec.ads) {
      const { hash } = await uploadImage({ imageUrl: adSpec.imageUrl });
      await delay(RATE_LIMIT_DELAY_MS);

      const creative = await createAdCreative({
        name: `${adSpec.name} · Creative`,
        pageId: metaClient.resolvedPageId,
        imageHash: hash,
        primaryText: adSpec.primaryText,
        headline: adSpec.headline,
        description: adSpec.description,
        callToActionType: adSpec.callToActionType,
        leadgenFormId: form.id,
      });
      createdNodes.unshift(creative.id);
      await delay(RATE_LIMIT_DELAY_MS);

      const ad = await createAd({
        adSetId: adSet.id,
        creativeId: creative.id,
        name: adSpec.name,
        status,
      });
      createdNodes.unshift(ad.id);
      await delay(RATE_LIMIT_DELAY_MS);

      ads.push({ id: ad.id, name: adSpec.name, creativeId: creative.id });
      creativeRows.push({ meta_creative_id: creative.id, meta_ad_id: ad.id, image_hash: hash, ad: adSpec });
      logger.info('orchestrate.meta.ad.created', { adId: ad.id, creativeId: creative.id });
    }

    // 5. Optionally flip the campaign live.
    if (spec.autoActivate) {
      await metaClient.post(`/${campaign.id}`, { status: 'ACTIVE' }, () => ({ id: campaign.id }));
      logger.info('orchestrate.meta.campaign.activated', { campaignId: campaign.id });
    }

    return {
      result: {
        campaignId: campaign.id,
        adSetId: adSet.id,
        leadGenFormId: form.id,
        ads,
      },
      interests,
      creativeRows,
      rollback: () => rollbackMeta(createdNodes),
    };
  } catch (err) {
    await rollbackMeta(createdNodes);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// TikTok orchestration (mirrors the Meta flow).
// ---------------------------------------------------------------------------

async function orchestrateTiktokCampaign(spec: CampaignSpec): Promise<TiktokOutcome> {
  const advertiserId = tiktokClient.mockMode
    ? tiktokClient.resolvedAdvertiserIdOrMock()
    : tiktokClient.resolvedAdvertiserId;
  const liveStatus = spec.autoActivate ? 'ENABLE' : 'DISABLE';
  const undo: Array<() => Promise<void>> = [];

  try {
    // Budget converted to the major currency unit (THB) for TikTok.
    const dailyBudgetThb = spec.dailyBudget / 100;

    // 1. Campaign (created DISABLE; activated at the end if requested).
    const campaign = await createTiktokCampaign(advertiserId, {
      name: spec.name,
      status: 'DISABLE',
    });
    undo.unshift(() =>
      deleteTiktokNode('/campaign/status/update/', {
        advertiser_id: advertiserId,
        campaign_ids: [campaign.id],
        operation_status: 'DELETE',
      })
    );
    logger.info('orchestrate.tiktok.campaign.created', { campaignId: campaign.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 2. Lead-gen instant form (created before the ad group, which references it).
    const form = await createTiktokLeadForm({
      advertiserId,
      title: spec.leadGenForm.headline,
      description: spec.leadGenForm.description,
      privacyPolicyUrl: spec.leadGenForm.privacyPolicyUrl,
      questions: [
        { type: 'NAME' },
        { type: 'PHONE' },
        { type: 'EMAIL' },
        ...(spec.leadGenForm.customQuestion
          ? [
              {
                type: 'CUSTOM' as const,
                label: spec.leadGenForm.customQuestion.label,
                options: spec.leadGenForm.customQuestion.options,
              },
            ]
          : []),
      ],
      successTitle: spec.leadGenForm.thankYouTitle,
      successDescription: spec.leadGenForm.thankYouBody,
      buttonText: spec.leadGenForm.thankYouButtonText,
      buttonUrl: spec.leadGenForm.thankYouButtonUrl,
    });
    logger.info('orchestrate.tiktok.form.created', { leadGenFormId: form.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 3. Ad group with translated targeting.
    const targeting = buildTiktokTargeting({
      countries: spec.targeting.countries,
      ageMin: spec.targeting.ageMin,
      ageMax: spec.targeting.ageMax,
      genders: spec.targeting.genders,
    });
    const adGroup = await createTiktokAdGroup({
      advertiserId,
      campaignId: campaign.id,
      name: `${spec.name} · AdGroup`,
      dailyBudget: dailyBudgetThb,
      targeting,
      leadFormId: form.id,
      scheduleStartTime: spec.schedule.startTime,
      scheduleEndTime: spec.schedule.endTime,
      status: 'DISABLE',
    });
    undo.unshift(() =>
      deleteTiktokNode('/adgroup/status/update/', {
        advertiser_id: advertiserId,
        adgroup_ids: [adGroup.id],
        operation_status: 'DELETE',
      })
    );
    logger.info('orchestrate.tiktok.adgroup.created', { adGroupId: adGroup.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 4. Per ad: upload image → create ad (creative bundled).
    const ads: TiktokPlatformResult['ads'] = [];
    const creativeRows: TiktokCreativeRow[] = [];

    for (const adSpec of spec.ads) {
      const { imageId } = await uploadTiktokImage({ advertiserId, imageUrl: adSpec.imageUrl });
      await delay(RATE_LIMIT_DELAY_MS);

      const ad = await createTiktokAd({
        advertiserId,
        adGroupId: adGroup.id,
        name: adSpec.name,
        imageId,
        adText: adSpec.primaryText,
        callToAction: adSpec.callToActionType === 'SIGN_UP' ? 'SIGN_UP' : 'LEARN_MORE',
        status: liveStatus,
      });
      undo.unshift(() =>
        deleteTiktokNode('/ad/status/update/', {
          advertiser_id: advertiserId,
          ad_ids: [ad.id],
          operation_status: 'DELETE',
        })
      );
      await delay(RATE_LIMIT_DELAY_MS);

      ads.push({ id: ad.id, name: adSpec.name, creativeId: ad.creativeId });
      creativeRows.push({ tiktok_creative_id: ad.creativeId, tiktok_ad_id: ad.id, ad: adSpec });
      logger.info('orchestrate.tiktok.ad.created', { adId: ad.id, creativeId: ad.creativeId });
    }

    // 5. Optionally flip the campaign live.
    if (spec.autoActivate) {
      await deleteTiktokNode('/campaign/status/update/', {
        advertiser_id: advertiserId,
        campaign_ids: [campaign.id],
        operation_status: 'ENABLE',
      });
      logger.info('orchestrate.tiktok.campaign.activated', { campaignId: campaign.id });
    }

    return {
      result: {
        campaignId: campaign.id,
        adGroupId: adGroup.id,
        leadGenFormId: form.id,
        ads,
      },
      creativeRows,
      rollback: () => rollbackTiktok(undo),
    };
  } catch (err) {
    await rollbackTiktok(undo);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistCampaign(
  spec: CampaignSpec,
  results: PlatformResults,
  meta?: MetaOutcome,
  tiktok?: TiktokOutcome
): Promise<string> {
  const { data: campaignRow, error: campaignErr } = await supabase
    .from('ad_campaigns')
    .insert({
      name: spec.name,
      goal: 'lead_gen',
      status: spec.autoActivate ? 'running' : 'draft',
      platforms: spec.platform,
      budget_daily: spec.dailyBudget / 100, // satang → THB
      geo_targets: {
        countries: spec.targeting.countries,
        ageMin: spec.targeting.ageMin,
        ageMax: spec.targeting.ageMax,
        genders: spec.targeting.genders ?? [],
        interests: meta?.interests ?? spec.targeting.interests,
        schedule: spec.schedule,
      },
      meta_campaign_id: results.meta?.campaignId ?? null,
      meta_adset_id: results.meta?.adSetId ?? null,
      meta_leadgen_form_id: results.meta?.leadGenFormId ?? null,
      tiktok_campaign_id: results.tiktok?.campaignId ?? null,
      tiktok_adgroup_id: results.tiktok?.adGroupId ?? null,
      tiktok_leadgen_form_id: results.tiktok?.leadGenFormId ?? null,
      start_date: spec.schedule.startTime,
      end_date: spec.schedule.endTime ?? null,
    })
    .select('id')
    .single();

  if (campaignErr || !campaignRow) {
    throw new OrchestrationError(
      `Failed to persist campaign: ${campaignErr?.message ?? 'no row returned'}`
    );
  }

  const dbCampaignId = campaignRow.id as string;

  const creativeInserts = [
    ...(meta?.creativeRows ?? []).map((c) => ({
      campaign_id: dbCampaignId,
      type: 'image',
      url: c.ad.imageUrl,
      copy_th: c.ad.primaryText,
      headline_th: c.ad.headline,
      cta_label: c.ad.callToActionType,
      status: 'active',
      meta_creative_id: c.meta_creative_id,
      meta_ad_id: c.meta_ad_id,
      image_hash: c.image_hash,
    })),
    ...(tiktok?.creativeRows ?? []).map((c) => ({
      campaign_id: dbCampaignId,
      type: 'image',
      url: c.ad.imageUrl,
      copy_th: c.ad.primaryText,
      headline_th: c.ad.headline,
      cta_label: c.ad.callToActionType,
      status: 'active',
      tiktok_creative_id: c.tiktok_creative_id,
      tiktok_ad_id: c.tiktok_ad_id,
    })),
  ];

  if (creativeInserts.length) {
    const { error: creativeErr } = await supabase.from('ad_creatives').insert(creativeInserts);
    if (creativeErr) {
      throw new OrchestrationError(`Failed to persist creatives: ${creativeErr.message}`);
    }
  }

  logger.info('orchestrate.persisted', {
    dbCampaignId,
    platforms: spec.platform,
    creatives: creativeInserts.length,
  });
  return dbCampaignId;
}

// ---------------------------------------------------------------------------
// Rollback helpers
// ---------------------------------------------------------------------------

async function rollbackMeta(nodeIds: string[]): Promise<void> {
  if (!nodeIds.length) return;
  logger.warn('orchestrate.meta.rollback', { count: nodeIds.length });
  for (const id of nodeIds) {
    try {
      await deleteMetaNode(id);
    } catch (err) {
      logger.error('orchestrate.meta.rollback.failed', {
        id,
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}

async function rollbackTiktok(undo: Array<() => Promise<void>>): Promise<void> {
  if (!undo.length) return;
  logger.warn('orchestrate.tiktok.rollback', { count: undo.length });
  for (const fn of undo) {
    try {
      await fn();
    } catch (err) {
      logger.error('orchestrate.tiktok.rollback.failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}

async function rollbackCompleted(rollbacks: Array<() => Promise<void>>): Promise<void> {
  for (const fn of rollbacks) {
    try {
      await fn();
    } catch (err) {
      logger.error('orchestrate.rollback.failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}
