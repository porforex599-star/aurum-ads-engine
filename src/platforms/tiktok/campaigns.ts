import { tiktokClient, TiktokClient } from './client';
import { mockTiktokCampaign } from './mock';
import { TiktokOperationStatus } from './types';

export interface CreateTiktokCampaignInput {
  name: string;
  /** TikTok budget in the currency's major unit (THB). */
  budget?: number;
  budgetMode?: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_INFINITE';
  objectiveType?: 'LEAD_GENERATION';
  status?: TiktokOperationStatus;
}

/**
 * Create a TikTok Lead Generation campaign.
 * POST /campaign/create/
 *
 * Created DISABLE (draft) by default; the orchestrator flips it to ENABLE at
 * the end when autoActivate is set, mirroring the Meta flow.
 */
export async function createTiktokCampaign(
  advertiserId: string,
  input: CreateTiktokCampaignInput,
  client: TiktokClient = tiktokClient
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    advertiser_id: advertiserId,
    campaign_name: input.name,
    objective_type: input.objectiveType ?? 'LEAD_GENERATION',
    budget_mode: input.budgetMode ?? 'BUDGET_MODE_INFINITE',
    operation_status: input.status ?? 'DISABLE',
  };
  if (input.budget !== undefined) body.budget = input.budget;

  const data = await client.post<{ campaign_id: string }>('/campaign/create/', body, () => ({
    campaign_id: mockTiktokCampaign().campaign_id,
  }));
  return { id: data.campaign_id };
}
