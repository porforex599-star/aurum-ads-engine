import { randomId } from './client';
import { config } from '../../config';
import { TiktokCampaign } from './types';

/**
 * Deterministic-shape mock responses for TIKTOK_MOCK_MODE=true.
 *
 * All ids are prefixed `mock_tt_*` so they are distinguishable from Meta's
 * `mock_*` ids (e.g. `mock_camp_*`) when inspecting Supabase rows or logs.
 */

export function mockTiktokCampaign(): TiktokCampaign {
  return {
    campaign_id: `mock_tt_camp_${randomId()}`,
    advertiser_id: config.tiktok.advertiserId || 'mock_advertiser',
    campaign_name: '',
    objective_type: 'LEAD_GENERATION',
    status: 'DISABLE', // draft
    create_time: new Date().toISOString(),
  };
}

export function mockTiktokAdGroup(): { adgroup_id: string } {
  return { adgroup_id: `mock_tt_adgroup_${randomId()}` };
}

export function mockTiktokLeadForm(): { page_id: string } {
  return { page_id: `mock_tt_form_${randomId()}` };
}

export function mockTiktokImage(): { image_id: string } {
  return { image_id: `mock_tt_img_${randomId()}` };
}

export function mockTiktokCreative(): { creative_id: string } {
  return { creative_id: `mock_tt_creative_${randomId()}` };
}

export function mockTiktokAd(): { ad_id: string } {
  return { ad_id: `mock_tt_ad_${randomId()}` };
}
