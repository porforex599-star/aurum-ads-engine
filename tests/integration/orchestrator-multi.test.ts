const callOrder: string[] = [];

jest.mock('../../src/platforms/meta/targeting', () => ({
  resolveInterests: jest.fn(async (names: string[]) => names.map((n, i) => ({ id: `int_${i}`, name: n }))),
}));
jest.mock('../../src/platforms/meta/campaigns', () => ({
  createMetaCampaign: jest.fn(async () => {
    callOrder.push('meta.campaign');
    return { id: 'camp_1' };
  }),
}));
jest.mock('../../src/platforms/meta/adsets', () => ({
  createMetaAdSet: jest.fn(async () => ({ id: 'adset_1' })),
}));
jest.mock('../../src/platforms/meta/leadgen-forms', () => ({
  createLeadGenForm: jest.fn(async () => ({ id: 'form_1' })),
}));
jest.mock('../../src/platforms/meta/creatives', () => ({
  uploadImage: jest.fn(async () => ({ hash: 'hash_1' })),
  createAdCreative: jest.fn(async () => ({ id: 'creative_1' })),
}));
jest.mock('../../src/platforms/meta/ads', () => ({
  createAd: jest.fn(async () => ({ id: 'ad_1' })),
  deleteMetaNode: jest.fn(async () => undefined),
}));

jest.mock('../../src/platforms/tiktok/campaigns', () => ({
  createTiktokCampaign: jest.fn(async () => {
    callOrder.push('tiktok.campaign');
    return { id: 'tt_camp_1' };
  }),
}));
jest.mock('../../src/platforms/tiktok/leadforms', () => ({
  createTiktokLeadForm: jest.fn(async () => ({ id: 'tt_form_1' })),
}));
jest.mock('../../src/platforms/tiktok/adgroups', () => ({
  createTiktokAdGroup: jest.fn(async () => ({ id: 'tt_adgroup_1' })),
}));
jest.mock('../../src/platforms/tiktok/creatives', () => ({
  uploadTiktokImage: jest.fn(async () => ({ imageId: 'tt_img_1' })),
  createTiktokAd: jest.fn(async () => ({ id: 'tt_ad_1', creativeId: 'tt_creative_1' })),
  deleteTiktokNode: jest.fn(async () => undefined),
}));

const campaignInsertSingle = jest.fn().mockResolvedValue({ data: { id: 'db_multi_1' }, error: null });
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
import { deleteMetaNode } from '../../src/platforms/meta/ads';
import { deleteTiktokNode } from '../../src/platforms/tiktok/creatives';
import { CampaignSpec } from '../../src/platforms/meta/types';

function makeSpec(platform: CampaignSpec['platform']): CampaignSpec {
  return {
    name: 'AURUM_AI_Multi_v1',
    platform,
    dailyBudget: 30000,
    targeting: { ageMin: 28, ageMax: 55, interests: ['Forex'], countries: ['TH'] },
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
}

describe('orchestrateCampaign · multi-platform', () => {
  beforeEach(() => {
    callOrder.length = 0;
    jest.clearAllMocks();
    campaignInsertSingle.mockResolvedValue({ data: { id: 'db_multi_1' }, error: null });
  });

  it('runs both orchestrators and persists both sets of IDs', async () => {
    const result = await orchestrateCampaign(makeSpec(['meta', 'tiktok']));

    expect(callOrder).toEqual(['meta.campaign', 'tiktok.campaign']);
    expect(result.results.meta).toMatchObject({ campaignId: 'camp_1', adSetId: 'adset_1' });
    expect(result.results.tiktok).toMatchObject({ campaignId: 'tt_camp_1', adGroupId: 'tt_adgroup_1' });

    expect(campaignInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['meta', 'tiktok'],
        meta_campaign_id: 'camp_1',
        meta_adset_id: 'adset_1',
        meta_leadgen_form_id: 'form_1',
        tiktok_campaign_id: 'tt_camp_1',
        tiktok_adgroup_id: 'tt_adgroup_1',
        tiktok_leadgen_form_id: 'tt_form_1',
      })
    );

    // Both a Meta creative row and a TikTok creative row are inserted.
    const rows = (creativeInsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.meta_creative_id === 'creative_1')).toBeDefined();
    expect(rows.find((r) => r.tiktok_creative_id === 'tt_creative_1')).toBeDefined();
  });

  it('rolls back the already-succeeded platform when a later platform fails', async () => {
    // Order tiktok→meta so TikTok succeeds, then Meta fails on campaign create.
    (createMetaCampaign as jest.Mock).mockRejectedValueOnce(new Error('meta boom'));

    await expect(orchestrateCampaign(makeSpec(['tiktok', 'meta']))).rejects.toMatchObject({
      code: 'orchestration_failed',
    });

    // TikTok had completed → its nodes are rolled back (campaign + adgroup + ad).
    expect(deleteTiktokNode).toHaveBeenCalled();
    // Meta failed at the first step, so it created nothing to delete.
    expect(deleteMetaNode).not.toHaveBeenCalled();
    // Nothing persisted.
    expect(campaignInsert).not.toHaveBeenCalled();
  });
});
