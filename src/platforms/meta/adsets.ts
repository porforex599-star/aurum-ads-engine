import { metaClient, MetaClient, randomId } from './client';
import { getBidStrategy } from './bid-strategy';
import { getAdvantageAudience } from './advantage-audience';
import { MetaIdResponse, MetaStatus, MetaTargeting } from './types';

export interface CreateAdSetInput {
  campaignId: string;
  name: string;
  dailyBudget: number; // smallest currency unit (THB satang)
  targeting: MetaTargeting;
  optimizationGoal?: 'LEAD_GENERATION';
  billingEvent?: 'IMPRESSIONS';
  bidStrategy?: string;
  status: MetaStatus;
  promotedObject: { pageId: string };
  startTime: string; // ISO 8601
  endTime?: string;
}

/**
 * Create an ad set with targeting + budget for a lead-gen campaign.
 * POST /{ad_account_id}/adsets
 */
export async function createMetaAdSet(
  input: CreateAdSetInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const t = input.targeting;
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: t.geoLocations.countries },
    age_min: t.ageMin,
    age_max: t.ageMax,
    // Meta requires an explicit Advantage Audience flag (0 = strict targeting,
    // 1 = AI audience expansion); it no longer defaults. See getAdvantageAudience().
    targeting_automation: { advantage_audience: getAdvantageAudience() },
  };
  if (t.genders?.length) targeting.genders = t.genders;
  if (t.interests?.length) targeting.interests = t.interests.map((i) => ({ id: i.id, name: i.name }));
  if (t.behaviors?.length) targeting.behaviors = t.behaviors.map((b) => ({ id: b.id, name: b.name }));
  if (t.locales?.length) targeting.locales = t.locales;

  const body: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: input.dailyBudget,
    optimization_goal: input.optimizationGoal ?? 'LEAD_GENERATION',
    billing_event: input.billingEvent ?? 'IMPRESSIONS',
    // bid_strategy lives here (ad-set level) because AURUM uses ABO: each ad set
    // carries its own daily_budget, and Meta requires bid_strategy at the budget
    // level. Default LOWEST_COST_WITHOUT_CAP — no bid_amount / bid_constraints.
    bid_strategy: input.bidStrategy ?? getBidStrategy(),
    status: input.status,
    targeting,
    promoted_object: { page_id: input.promotedObject.pageId },
    start_time: input.startTime,
  };
  if (input.endTime) body.end_time = input.endTime;

  return client.post<MetaIdResponse>(`/${client.adAccountPath}/adsets`, body, () => ({
    id: `mock_adset_${randomId()}`,
  }));
}
