import { metaClient, MetaClient, randomId } from './client';
import { MetaIdResponse, MetaStatus } from './types';

export interface CreateCampaignInput {
  name: string;
  objective?: 'OUTCOME_LEADS';
  specialAdCategories?: string[];
  status: MetaStatus;
}

/**
 * Create a Lead Generation campaign.
 * POST /{ad_account_id}/campaigns
 *
 * Special ad category FINANCIAL_PRODUCTS_AND_SERVICES is locked in at creation
 * and cannot be changed afterwards — see Meta Special Ad Categories docs.
 */
export async function createMetaCampaign(
  input: CreateCampaignInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const body = {
    name: input.name,
    objective: input.objective ?? 'OUTCOME_LEADS',
    status: input.status,
    special_ad_categories: input.specialAdCategories ?? ['FINANCIAL_PRODUCTS_AND_SERVICES'],
  };
  return client.post<MetaIdResponse>(`/${client.adAccountPath}/campaigns`, body, () => ({
    id: `mock_camp_${randomId()}`,
  }));
}
