import { tiktokClient, TiktokClient } from './client';
import { TiktokCampaignStatus } from './types';

/** Normalize TikTok's secondary/operation status into a lifecycle bucket. */
function normalizeStatus(status: string): TiktokCampaignStatus['normalized'] {
  switch (status) {
    case 'CAMPAIGN_STATUS_ENABLE':
    case 'ENABLE':
      return 'live';
    case 'CAMPAIGN_STATUS_DISABLE':
    case 'DISABLE':
    case 'CAMPAIGN_STATUS_DELETE':
      return 'paused';
    case 'CAMPAIGN_STATUS_NOT_DELIVERY':
    case 'AUDIT_DENY':
    case 'REVIEW_REJECT':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Fetch a campaign's delivery status from TikTok.
 * GET /campaign/get/ filtered by campaign_ids.
 */
export async function getTiktokCampaignStatus(
  campaignId: string,
  client: TiktokClient = tiktokClient,
  advertiserId: string = client.mockMode ? 'mock_advertiser' : client.resolvedAdvertiserId
): Promise<TiktokCampaignStatus> {
  const data = await client.get<{ list: { campaign_id: string; operation_status: string }[] }>(
    '/campaign/get/',
    {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ campaign_ids: [campaignId] }),
    },
    () => ({ list: [{ campaign_id: campaignId, operation_status: 'DISABLE' }] })
  );
  const row = data.list?.[0];
  const status = row?.operation_status ?? 'UNKNOWN';
  return {
    id: campaignId,
    status,
    normalized: normalizeStatus(status),
    raw: row,
  };
}
