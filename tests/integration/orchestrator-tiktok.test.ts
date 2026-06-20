const callOrder: string[] = [];

// Meta modules are unused for a tiktok-only spec, but the orchestrator imports
// them — provide light mocks so nothing reaches the network.
jest.mock('../../src/platforms/meta/targeting', () => ({ resolveInterests: jest.fn(async () => []) }));
jest.mock('../../src/platforms/meta/campaigns', () => ({ createMetaCampaign: jest.fn() }));
jest.mock('../../src/platforms/meta/adsets', () => ({ createMetaAdSet: jest.fn() }));
jest.mock('../../src/platforms/meta/leadgen-forms', () => ({ createLeadGenForm: jest.fn() }));
jest.mock('../../src/platforms/meta/creatives', () => ({ uploadImage: jest.fn(), createAdCreative: jest.fn() }));
jest.mock('../../src/platforms/meta/ads', () => ({ createAd: jest.fn(), deleteMetaNode: jest.fn() }));

jest.mock('../../src/platforms/tiktok/campaigns', () => ({
  createTiktokCampaign: jest.fn(async () => {
    callOrder.push('campaign');
    return { id: 'tt_camp_1' };
  }),
}));
jest.mock('../../src/platforms/tiktok/leadforms', () => ({
  createTiktokLeadForm: jest.fn(async () => {
    callOrder.push('form');
    return { id: 'tt_form_1' };
  }),
}));
jest.mock('../../src/platforms/tiktok/adgroups', () => ({
  createTiktokAdGroup: jest.fn(async () => {
    callOrder.push('adgroup');
    return { id: 'tt_adgroup_1' };
  }),
}));
jest.mock('../../src/platforms/tiktok/creatives', () => ({
  uploadTiktokImage: jest.fn(async () => {
    callOrder.push('upload');
    return { imageId: 'tt_img_1' };
  }),
  createTiktokAd: jest.fn(async () => {
    callOrder.push('ad');
    return { id: 'tt_ad_1', creativeId: 'tt_creative_1' };
  }),
  deleteTiktokNode: jest.fn(async () => undefined),
}));

const campaignInsertSingle = jest.fn().mockResolvedValue({ data: { id: 'db_tt_1' }, error: null });
const campaignInsert = jest.fn(() => ({ select: () => ({ single: campaignInsertSingle }) }));
const creativeInsert = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('../../src/db/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => ({
      insert: table === 'ad_campaigns' ? campaignInsert : creativeInsert,
    })),
  },
}));

import { orchestrateCampaign } from '../../src/services/campaign-orchestrator';
import { createTiktokAdGroup } from '../../src/platforms/tiktok/adgroups';
import { CampaignSpec } from '../../src/platforms/meta/types';

const spec: CampaignSpec = {
  name: 'AURUM_AI_TikTok_v1',
  platform: ['tiktok'],
  dailyBudget: 30000,
  targeting: { ageMin: 28, ageMax: 55, interests: ['Forex'], countries: ['TH', 'SG'], genders: ['male'] },
  schedule: { startTime: '2026-06-20T00:00:00+07:00' },
  leadGenForm: {
    headline: 'h',
    description: 'd',
    privacyPolicyUrl: 'https://aurumlive.com/privacy',
    thankYouTitle: 't',
    thankYouBody: 'b',
    thankYouButtonText: 'go',
    thankYouButtonUrl: 'https://aurumlive.com',
  },
  ads: [
    {
      name: 'Ad1',
      imageUrl: 'https://aurumlive.com/img/ad1.jpg',
      primaryText: 'text',
      headline: 'head',
      callToActionType: 'SIGN_UP',
    },
  ],
  autoActivate: false,
};

describe('orchestrateCampaign · tiktok-only', () => {
  beforeEach(() => {
    callOrder.length = 0;
  });

  it('calls the TikTok chain in the correct order and returns IDs under results.tiktok', async () => {
    const result = await orchestrateCampaign(spec);

    expect(callOrder).toEqual(['campaign', 'form', 'adgroup', 'upload', 'ad']);
    expect(result).toEqual({
      dbCampaignId: 'db_tt_1',
      results: {
        tiktok: {
          campaignId: 'tt_camp_1',
          adGroupId: 'tt_adgroup_1',
          leadGenFormId: 'tt_form_1',
          ads: [{ id: 'tt_ad_1', name: 'Ad1', creativeId: 'tt_creative_1' }],
        },
      },
    });
  });

  it('forwards translated targeting (location ids + age buckets + gender) to the ad group', async () => {
    await orchestrateCampaign(spec);

    expect(createTiktokAdGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        leadFormId: 'tt_form_1',
        targeting: expect.objectContaining({
          location_ids: ['6252001', '1880251'], // TH, SG
          gender: 'GENDER_MALE',
          age_groups: ['AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100'],
        }),
      })
    );
  });

  it('persists platforms ["tiktok"] with tiktok_* IDs and tiktok creative rows', async () => {
    await orchestrateCampaign(spec);

    expect(campaignInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['tiktok'],
        budget_daily: 300,
        tiktok_campaign_id: 'tt_camp_1',
        tiktok_adgroup_id: 'tt_adgroup_1',
        tiktok_leadgen_form_id: 'tt_form_1',
        meta_campaign_id: null,
      })
    );
    expect(creativeInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        campaign_id: 'db_tt_1',
        tiktok_creative_id: 'tt_creative_1',
        tiktok_ad_id: 'tt_ad_1',
      }),
    ]);
  });
});
