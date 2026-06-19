import { supabase } from '../db/supabase';
import { logger } from '../lib/logger';
import { OrchestrationError } from '../lib/errors';
import { metaClient } from '../platforms/meta/client';
import { createMetaCampaign } from '../platforms/meta/campaigns';
import { createMetaAdSet } from '../platforms/meta/adsets';
import { createLeadGenForm } from '../platforms/meta/leadgen-forms';
import { uploadImage, createAdCreative } from '../platforms/meta/creatives';
import { createAd, deleteMetaNode } from '../platforms/meta/ads';
import { resolveInterests } from '../platforms/meta/targeting';
import { CampaignSpec, OrchestrationResult } from '../platforms/meta/types';

const RATE_LIMIT_DELAY_MS = 100;
const THAI_LOCALE = 6;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapGenders(genders?: ('male' | 'female')[]): number[] | undefined {
  if (!genders?.length) return undefined;
  return genders.map((g) => (g === 'male' ? 1 : 2));
}

/**
 * Orchestrate the full Meta lead-gen chain from a high-level spec:
 *   campaign → ad set → lead form → (per ad: image → creative → ad)
 * then persist to Supabase. On any failure, best-effort rollback of whatever
 * was created in Meta, then throw.
 */
export async function orchestrateCampaign(spec: CampaignSpec): Promise<OrchestrationResult> {
  // Track created Meta nodes for rollback (reverse order on failure).
  const createdNodes: string[] = [];
  const status = spec.autoActivate ? 'ACTIVE' : 'PAUSED';

  try {
    // Resolve interest names → Meta interest IDs.
    const interests = await resolveInterests(spec.targeting.interests);
    await delay(RATE_LIMIT_DELAY_MS);

    // 1. Campaign (always created PAUSED first; activated at the end if requested).
    const campaign = await createMetaCampaign({ name: spec.name, status: 'PAUSED' });
    createdNodes.unshift(campaign.id);
    logger.info('orchestrate.campaign.created', { campaignId: campaign.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 2. Ad set with targeting.
    const adSet = await createMetaAdSet({
      campaignId: campaign.id,
      name: `${spec.name} · AdSet`,
      dailyBudget: spec.dailyBudget,
      targeting: {
        geoLocations: { countries: ['TH'] },
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
    logger.info('orchestrate.adset.created', { adSetId: adSet.id });
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
    logger.info('orchestrate.form.created', { leadGenFormId: form.id });
    await delay(RATE_LIMIT_DELAY_MS);

    // 4. Per ad: upload image → create creative → create ad.
    const ads: OrchestrationResult['ads'] = [];
    const creativeRows: Array<{
      meta_creative_id: string;
      meta_ad_id: string;
      image_hash: string;
      ad: CampaignSpec['ads'][number];
    }> = [];

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
      logger.info('orchestrate.ad.created', { adId: ad.id, creativeId: creative.id });
    }

    // 5. Optionally flip the campaign live.
    if (spec.autoActivate) {
      await metaClient.post(`/${campaign.id}`, { status: 'ACTIVE' }, () => ({ id: campaign.id }));
      logger.info('orchestrate.campaign.activated', { campaignId: campaign.id });
    }

    // 6. Persist to Supabase.
    const dbCampaignId = await persistCampaign(spec, {
      campaignId: campaign.id,
      adSetId: adSet.id,
      leadGenFormId: form.id,
      interests,
      creativeRows,
    });

    return {
      campaignId: campaign.id,
      adSetId: adSet.id,
      leadGenFormId: form.id,
      ads,
      dbCampaignId,
    };
  } catch (err) {
    await rollback(createdNodes);
    const message = err instanceof Error ? err.message : 'Unknown orchestration error';
    logger.error('orchestrate.failed', { message });
    if (err instanceof OrchestrationError) throw err;
    throw new OrchestrationError(message, { rolledBack: createdNodes.length });
  }
}

interface PersistInput {
  campaignId: string;
  adSetId: string;
  leadGenFormId: string;
  interests: { id: string; name: string }[];
  creativeRows: Array<{
    meta_creative_id: string;
    meta_ad_id: string;
    image_hash: string;
    ad: CampaignSpec['ads'][number];
  }>;
}

async function persistCampaign(spec: CampaignSpec, input: PersistInput): Promise<string> {
  const { data: campaignRow, error: campaignErr } = await supabase
    .from('ad_campaigns')
    .insert({
      name: spec.name,
      goal: 'lead_gen',
      status: spec.autoActivate ? 'running' : 'draft',
      platforms: ['meta'],
      budget_daily: spec.dailyBudget / 100, // satang → THB
      geo_targets: {
        countries: ['TH'],
        ageMin: spec.targeting.ageMin,
        ageMax: spec.targeting.ageMax,
        genders: spec.targeting.genders ?? [],
        interests: input.interests,
        schedule: spec.schedule,
      },
      meta_campaign_id: input.campaignId,
      meta_adset_id: input.adSetId,
      meta_leadgen_form_id: input.leadGenFormId,
      start_date: spec.schedule.startTime,
      end_date: spec.schedule.endTime ?? null,
    })
    .select('id')
    .single();

  if (campaignErr || !campaignRow) {
    throw new OrchestrationError(`Failed to persist campaign: ${campaignErr?.message ?? 'no row returned'}`);
  }

  const dbCampaignId = campaignRow.id as string;

  if (input.creativeRows.length) {
    const { error: creativeErr } = await supabase.from('ad_creatives').insert(
      input.creativeRows.map((c) => ({
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
      }))
    );
    if (creativeErr) {
      throw new OrchestrationError(`Failed to persist creatives: ${creativeErr.message}`);
    }
  }

  logger.info('orchestrate.persisted', { dbCampaignId, creatives: input.creativeRows.length });
  return dbCampaignId;
}

async function rollback(nodeIds: string[]): Promise<void> {
  if (!nodeIds.length) return;
  logger.warn('orchestrate.rollback', { count: nodeIds.length });
  for (const id of nodeIds) {
    try {
      await deleteMetaNode(id);
    } catch (err) {
      logger.error('orchestrate.rollback.failed', {
        id,
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}
