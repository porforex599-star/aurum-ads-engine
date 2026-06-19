import { metaClient, MetaClient, randomId } from './client';
import { MetaIdResponse, MetaStatus } from './types';

export interface CreateAdInput {
  adSetId: string;
  creativeId: string;
  name: string;
  status: MetaStatus;
}

/**
 * Create an ad linking a creative to an ad set.
 * POST /{ad_account_id}/ads
 */
export async function createAd(
  input: CreateAdInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const body = {
    name: input.name,
    adset_id: input.adSetId,
    creative: { creative_id: input.creativeId },
    status: input.status,
  };
  return client.post<MetaIdResponse>(`/${client.adAccountPath}/ads`, body, () => ({
    id: `mock_ad_${randomId()}`,
  }));
}

/**
 * Delete a Meta node by id (best-effort, used during orchestration rollback).
 * In mock mode this is a no-op.
 */
export async function deleteMetaNode(id: string, client: MetaClient = metaClient): Promise<void> {
  await client.del(`/${id}`);
}
