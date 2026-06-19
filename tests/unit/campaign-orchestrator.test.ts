const callOrder: string[] = [];

jest.mock('../../src/platforms/meta/targeting', () => ({
  resolveInterests: jest.fn(async (names: string[]) => {
    callOrder.push('resolveInterests');
    return names.map((name, i) => ({ id: `int_${i}`, name }));
  }),
}));
jest.mock('../../src/platforms/meta/campaigns', () => ({
  createMetaCampaign: jest.fn(async () => {
    callOrder.push('campaign');
    return { id: 'camp_1' };
  }),
}));
jest.mock('../../src/platforms/meta/adsets', () => ({
  createMetaAdSet: jest.fn(async () => {
    callOrder.push('adset');
    return { id: 'adset_1' };
  }),
}));
jest.mock('../../src/platforms/meta/leadgen-forms', () => ({
  createLeadGenForm: jest.fn(async () => {
    callOrder.push('form');
    return { id: 'form_1' };
  }),
}));
jest.mock('../../src/platforms/meta/creatives', () => ({
  uploadImage: jest.fn(async () => {
    callOrder.push('upload');
    return { hash: 'hash_1' };
  }),
  createAdCreative: jest.fn(async () => {
    callOrder.push('creative');
    return { id: 'creative_1' };
  }),
}));
jest.mock('../../src/platforms/meta/ads', () => ({
  createAd: jest.fn(async () => {
    callOrder.push('ad');
    return { id: 'ad_1' };
  }),
  deleteMetaNode: jest.fn(async () => undefined),
}));

const campaignInsertSingle = jest.fn().mockResolvedValue({ data: { id: 'db_uuid_1' }, error: null });
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
import { createMetaCampaign } from '../../src/platforms/meta/campaigns';
import { CampaignSpec } from '../../src/platforms/meta/types';

const spec: CampaignSpec = {
  name: 'AURUM_AI_LeadGen_Test_v1',
  dailyBudget: 30000,
  targeting: { ageMin: 28, ageMax: 55, interests: ['Forex', 'Gold'] },
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
      callToActionType: 'LEARN_MORE',
    },
  ],
  autoActivate: false,
};

describe('orchestrateCampaign', () => {
  beforeEach(() => {
    callOrder.length = 0;
  });

  it('runs the chain in the correct order and returns all IDs', async () => {
    const result = await orchestrateCampaign(spec);

    expect(callOrder).toEqual([
      'resolveInterests',
      'campaign',
      'adset',
      'form',
      'upload',
      'creative',
      'ad',
    ]);
    expect(result).toEqual({
      campaignId: 'camp_1',
      adSetId: 'adset_1',
      leadGenFormId: 'form_1',
      ads: [{ id: 'ad_1', name: 'Ad1', creativeId: 'creative_1' }],
      dbCampaignId: 'db_uuid_1',
    });
  });

  it('persists the campaign with Meta IDs and budget converted to THB', async () => {
    await orchestrateCampaign(spec);

    expect(campaignInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: spec.name,
        goal: 'lead_gen',
        status: 'draft',
        platforms: ['meta'],
        budget_daily: 300, // 30000 satang → 300 THB
        meta_campaign_id: 'camp_1',
        meta_adset_id: 'adset_1',
        meta_leadgen_form_id: 'form_1',
      })
    );
    expect(creativeInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        campaign_id: 'db_uuid_1',
        type: 'image',
        meta_creative_id: 'creative_1',
        meta_ad_id: 'ad_1',
        image_hash: 'hash_1',
      }),
    ]);
  });

  it('rolls back created Meta nodes when a later step fails', async () => {
    const { deleteMetaNode } = jest.requireMock('../../src/platforms/meta/ads');
    (createMetaCampaign as jest.Mock).mockImplementationOnce(async () => {
      callOrder.push('campaign');
      return { id: 'camp_rollback' };
    });
    campaignInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });

    await expect(orchestrateCampaign(spec)).rejects.toMatchObject({ code: 'orchestration_failed' });
    // All four Meta nodes (campaign, adset, form, creative, ad) should be deleted.
    expect(deleteMetaNode).toHaveBeenCalled();
  });
});
