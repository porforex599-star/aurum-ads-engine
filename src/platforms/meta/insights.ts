import { metaClient, MetaClient } from './client';
import { MetaCampaignStatus } from './types';

/**
 * Normalize Meta's effective_status into a simple lifecycle bucket.
 */
function normalizeStatus(effective: string): MetaCampaignStatus['normalized'] {
  switch (effective) {
    case 'ACTIVE':
      return 'live';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'paused';
    case 'DISAPPROVED':
    case 'WITH_ISSUES':
    case 'PENDING_REVIEW':
    case 'PENDING_BILLING_INFO':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Fetch a campaign's delivery status from Meta.
 * GET /{campaign_id}?fields=status,effective_status
 */
export async function getCampaignStatus(
  campaignId: string,
  client: MetaClient = metaClient
): Promise<MetaCampaignStatus> {
  const data = await client.get<{ id: string; status: string; effective_status: string }>(
    `/${campaignId}`,
    { fields: 'status,effective_status' },
    () => ({ id: campaignId, status: 'PAUSED', effective_status: 'PAUSED' })
  );
  return {
    id: data.id,
    status: data.status,
    effectiveStatus: data.effective_status,
    normalized: normalizeStatus(data.effective_status),
    raw: data,
  };
}

/**
 * Insights stub — full implementation deferred to PR-2. Returns an empty
 * metrics envelope so callers have a stable shape to code against.
 */
export async function getCampaignInsights(
  campaignId: string
): Promise<{ campaignId: string; metrics: Record<string, never>; note: string }> {
  return {
    campaignId,
    metrics: {},
    note: 'Insights endpoint is a stub in Phase 2 PR-1; full metrics arrive in PR-2.',
  };
}
