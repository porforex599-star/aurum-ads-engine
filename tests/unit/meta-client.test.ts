import axios from 'axios';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const instance = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
};
mockedAxios.create.mockReturnValue(instance as never);

// Import after axios is mocked so the singleton picks up the mock.
import { MetaClient } from '../../src/platforms/meta/client';
import { createMetaCampaign, getSpecialAdCategories } from '../../src/platforms/meta/campaigns';
import { createMetaAdSet } from '../../src/platforms/meta/adsets';
import { MetaApiError } from '../../src/lib/errors';

const realConfig = {
  appId: 'app',
  appSecret: 'secret',
  pageId: '111',
  adAccountId: 'act_999',
  pageAccessToken: 'TOKEN_SECRET',
  apiVersion: 'v23.0',
  apiBaseUrl: 'https://graph.facebook.com',
  mockMode: false,
};

describe('MetaClient', () => {
  describe('mock mode', () => {
    const client = new MetaClient({ ...realConfig, mockMode: true });

    it('returns prefixed fake campaign id without hitting axios', async () => {
      const res = await createMetaCampaign({ name: 'Test', status: 'PAUSED' }, client);
      expect(res.id).toMatch(/^mock_camp_/);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('returns fake image hash', async () => {
      const res = await client.uploadImageFromUrl('https://x/y.jpg');
      expect(res.hash).toMatch(/^mock_img_/);
    });
  });

  describe('real mode', () => {
    const client = new MetaClient(realConfig);

    it('posts to the correct path with access_token param and returns data', async () => {
      instance.post.mockResolvedValueOnce({ data: { id: '23999' } });
      const res = await createMetaCampaign({ name: 'Real', status: 'PAUSED' }, client);

      expect(res).toEqual({ id: '23999' });
      expect(instance.post).toHaveBeenCalledWith(
        '/act_999/campaigns',
        expect.objectContaining({
          name: 'Real',
          objective: 'OUTCOME_LEADS',
          special_ad_categories: ['NONE'],
        }),
        { params: { access_token: 'TOKEN_SECRET' } }
      );
    });

    it('resolves the image hash from the adimages response shape', async () => {
      instance.post.mockResolvedValueOnce({ data: { images: { 'y.jpg': { hash: 'abc123' } } } });
      const res = await client.uploadImageFromUrl('https://x/y.jpg');
      expect(res.hash).toBe('abc123');
    });

    it('normalizes Meta error envelope into MetaApiError', async () => {
      instance.post.mockRejectedValueOnce({
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid parameter',
              error_user_msg: 'Something is wrong with your ad',
              code: 100,
              error_subcode: 1487,
              fbtrace_id: 'AbCdEf',
            },
          },
        },
      });

      await expect(createMetaCampaign({ name: 'Bad', status: 'PAUSED' }, client)).rejects.toMatchObject({
        name: 'MetaApiError',
        message: 'Invalid parameter',
        userMessage: 'Something is wrong with your ad',
        metaCode: 100,
        fbtraceId: 'AbCdEf',
        statusCode: 400,
      });
    });

    it('retries on 429 then succeeds', async () => {
      instance.post
        .mockRejectedValueOnce({ message: 'rate limited', response: { status: 429, data: {} } })
        .mockResolvedValueOnce({ data: { id: 'after_retry' } });

      const res = await createMetaCampaign({ name: 'Retry', status: 'PAUSED' }, client);
      expect(res.id).toBe('after_retry');
      expect(instance.post).toHaveBeenCalledTimes(2);
    });

    it('throws when access token is missing', async () => {
      const noToken = new MetaClient({ ...realConfig, pageAccessToken: undefined });
      await expect(createMetaCampaign({ name: 'X', status: 'PAUSED' }, noToken)).rejects.toBeInstanceOf(
        MetaApiError
      );
    });

    it('builds the create payload with special_ad_categories ["NONE"] by default', async () => {
      delete process.env.META_SPECIAL_AD_CATEGORIES;
      instance.post.mockResolvedValueOnce({ data: { id: '24000' } });
      await createMetaCampaign({ name: 'Default', status: 'PAUSED' }, client);

      expect(instance.post).toHaveBeenCalledWith(
        '/act_999/campaigns',
        expect.objectContaining({ special_ad_categories: ['NONE'] }),
        { params: { access_token: 'TOKEN_SECRET' } }
      );
    });

    it('sends is_adset_budget_sharing_enabled: false (boolean) by default', async () => {
      delete process.env.META_CAMPAIGN_BUDGET_SHARING_ENABLED;
      instance.post.mockResolvedValueOnce({ data: { id: '24001' } });
      await createMetaCampaign({ name: 'NonCbo', status: 'PAUSED' }, client);

      const body = instance.post.mock.calls[0][1];
      expect(body.is_adset_budget_sharing_enabled).toBe(false);
      expect(typeof body.is_adset_budget_sharing_enabled).toBe('boolean');
    });

    it('flips is_adset_budget_sharing_enabled to true when env enables CBO', async () => {
      process.env.META_CAMPAIGN_BUDGET_SHARING_ENABLED = 'true';
      instance.post.mockResolvedValueOnce({ data: { id: '24002' } });
      await createMetaCampaign({ name: 'Cbo', status: 'PAUSED' }, client);

      const body = instance.post.mock.calls[0][1];
      expect(body.is_adset_budget_sharing_enabled).toBe(true);

      delete process.env.META_CAMPAIGN_BUDGET_SHARING_ENABLED;
    });

    it('sends bid_strategy: LOWEST_COST_WITHOUT_CAP by default (no bid_amount)', async () => {
      delete process.env.META_BID_STRATEGY;
      instance.post.mockResolvedValueOnce({ data: { id: '24003' } });
      await createMetaCampaign({ name: 'Bid', status: 'PAUSED' }, client);

      const body = instance.post.mock.calls[0][1];
      expect(body.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
      expect(body).not.toHaveProperty('bid_amount');
      expect(body).not.toHaveProperty('bid_constraints');
    });

    it('flows META_BID_STRATEGY override (COST_CAP) into the payload', async () => {
      process.env.META_BID_STRATEGY = 'COST_CAP';
      instance.post.mockResolvedValueOnce({ data: { id: '24004' } });
      await createMetaCampaign({ name: 'CostCap', status: 'PAUSED' }, client);

      const body = instance.post.mock.calls[0][1];
      expect(body.bid_strategy).toBe('COST_CAP');

      delete process.env.META_BID_STRATEGY;
    });

    it('adset payload omits bid_amount / bid_constraints / VALUE optimization', async () => {
      instance.post.mockResolvedValueOnce({ data: { id: 'adset_1' } });
      await createMetaAdSet(
        {
          campaignId: '123',
          name: 'AdSet',
          dailyBudget: 30000,
          targeting: { geoLocations: { countries: ['TH'] }, ageMin: 25, ageMax: 55 },
          status: 'PAUSED',
          promotedObject: { pageId: '111' },
          startTime: '2026-06-22T00:00:00+0700',
        },
        client
      );

      const body = instance.post.mock.calls[0][1];
      expect(body).not.toHaveProperty('bid_amount');
      expect(body).not.toHaveProperty('bid_constraints');
      expect(body.optimization_goal).toBe('LEAD_GENERATION');
      expect(body.optimization_goal).not.toBe('VALUE');
    });
  });
});

describe('special_ad_categories', () => {
  beforeEach(() => {
    delete process.env.META_SPECIAL_AD_CATEGORIES;
  });

  test('defaults to ["NONE"] when env unset', () => {
    expect(getSpecialAdCategories()).toEqual(['NONE']);
  });

  test('parses comma-separated env override', () => {
    process.env.META_SPECIAL_AD_CATEGORIES = 'HOUSING,EMPLOYMENT';
    expect(getSpecialAdCategories()).toEqual(['HOUSING', 'EMPLOYMENT']);
  });

  test('upper-cases + trims', () => {
    process.env.META_SPECIAL_AD_CATEGORIES = ' credit ,housing ';
    expect(getSpecialAdCategories()).toEqual(['CREDIT', 'HOUSING']);
  });

  test('falls back to ["NONE"] when env contains only invalid tokens', () => {
    process.env.META_SPECIAL_AD_CATEGORIES = 'GARBAGE,FOO';
    expect(getSpecialAdCategories()).toEqual(['NONE']);
  });

  test('drops invalid tokens but keeps valid ones', () => {
    process.env.META_SPECIAL_AD_CATEGORIES = 'HOUSING,GARBAGE';
    expect(getSpecialAdCategories()).toEqual(['HOUSING']);
  });
});
