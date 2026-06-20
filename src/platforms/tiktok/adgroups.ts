import { tiktokClient, TiktokClient } from './client';
import { mockTiktokAdGroup } from './mock';
import { TiktokOperationStatus, TiktokTargeting } from './types';

export interface CreateTiktokAdGroupInput {
  advertiserId: string;
  campaignId: string;
  name: string;
  /** Daily budget in the currency's major unit (THB). */
  dailyBudget: number;
  targeting: TiktokTargeting;
  /** The lead-gen instant form (page) id this ad group optimizes toward. */
  leadFormId: string;
  scheduleStartTime: string; // ISO 8601
  scheduleEndTime?: string;
  status?: TiktokOperationStatus;
}

/**
 * Create a TikTok Ad Group (the TikTok equivalent of a Meta "Ad Set").
 * POST /adgroup/create/
 *
 * Targeting fields (location_ids, age_groups, gender, interest_category_ids)
 * are produced by the targeting translation layer.
 */
export async function createTiktokAdGroup(
  input: CreateTiktokAdGroupInput,
  client: TiktokClient = tiktokClient
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    advertiser_id: input.advertiserId,
    campaign_id: input.campaignId,
    adgroup_name: input.name,
    promotion_type: 'LEAD_GENERATION',
    optimization_goal: 'LEAD_GENERATION',
    billing_event: 'CPC',
    pacing: 'PACING_MODE_SMOOTH',
    budget_mode: 'BUDGET_MODE_DAY',
    budget: input.dailyBudget,
    schedule_type: input.scheduleEndTime ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
    schedule_start_time: input.scheduleStartTime,
    lead_gen_form_id: input.leadFormId,
    location_ids: input.targeting.location_ids,
    age_groups: input.targeting.age_groups,
    gender: input.targeting.gender,
    operation_status: input.status ?? 'DISABLE',
  };
  if (input.scheduleEndTime) body.schedule_end_time = input.scheduleEndTime;
  if (input.targeting.interest_category_ids.length) {
    body.interest_category_ids = input.targeting.interest_category_ids;
  }

  const data = await client.post<{ adgroup_id: string }>('/adgroup/create/', body, () =>
    mockTiktokAdGroup()
  );
  return { id: data.adgroup_id };
}
