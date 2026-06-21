import axios from 'axios';

// Mock axios so we can prove the real Meta API is never called in mock mode.
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const axiosInstance = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
mockedAxios.create.mockReturnValue(axiosInstance as never);

// In-memory Supabase mock that records inserts.
const inserted: Record<string, unknown[]> = { ad_campaigns: [], ad_creatives: [] };
jest.mock('../../src/db/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        inserted[table].push(...arr);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'db-uuid-integration' }, error: null }),
          }),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      },
    }),
  },
}));

import request from 'supertest';
import { app } from '../../src/server';

const API_KEY = process.env.AURUM_ADS_ENGINE_API_KEY as string;

const validBody = {
  name: 'AURUM_AI_LeadGen_Test_v1',
  dailyBudget: 30000,
  targeting: { ageMin: 28, ageMax: 55, interests: ['Forex', 'Gold', 'Investment'] },
  schedule: { startTime: '2026-06-20T00:00:00+07:00' },
  leadGenForm: {
    headline: 'ทดลอง AURUM AI ฟรี 7 วัน',
    description: 'รับบทวิเคราะห์ราคาทอง XAUUSD จาก AI',
    privacyPolicyUrl: 'https://aurumlive.com/privacy',
    thankYouTitle: 'ขอบคุณ!',
    thankYouBody: 'ทีม AURUM AI จะติดต่อกลับภายใน 1-2 ชั่วโมง',
    thankYouButtonText: 'เข้าใช้งานทันที',
    thankYouButtonUrl: 'https://aurumlive.com',
  },
  ads: [
    {
      name: 'Ad1_Authority_v1',
      imageUrl: 'https://aurumlive.com/img/ad1.jpg',
      primaryText: 'AURUM AI ใช้ปัญญาประดิษฐ์...',
      headline: 'AI วิเคราะห์ราคาทอง XAUUSD',
      callToActionType: 'LEARN_MORE',
    },
  ],
};

describe('POST /api/v1/campaigns (mock mode)', () => {
  beforeEach(() => {
    inserted.ad_campaigns.length = 0;
    inserted.ad_creatives.length = 0;
  });

  it('rejects requests without an API key', async () => {
    const res = await request(app).post('/api/v1/campaigns').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('rejects invalid input with 400', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', API_KEY)
      .send({ name: 'missing the rest' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('creates the full chain end-to-end and persists to Supabase', async () => {
    const res = await request(app).post('/api/v1/campaigns').set('X-API-Key', API_KEY).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dbCampaignId: 'db-uuid-integration' });
    expect(res.body.results.meta).toMatchObject({
      campaignId: expect.stringMatching(/^mock_camp_/),
      adSetId: expect.stringMatching(/^mock_adset_/),
      leadGenFormId: expect.stringMatching(/^mock_form_/),
    });
    expect(res.body.results.tiktok).toBeUndefined();
    expect(res.body.results.meta.ads).toHaveLength(1);
    expect(res.body.results.meta.ads[0]).toMatchObject({
      id: expect.stringMatching(/^mock_ad_/),
      name: 'Ad1_Authority_v1',
      creativeId: expect.stringMatching(/^mock_creative_/),
    });

    // Backward-compat shim: Phase 2 top-level fields mirror results.meta so the
    // current Aurum-Admin /ads frontend keeps reading data.campaignId.
    expect(res.body).toMatchObject({
      campaignId: res.body.results.meta.campaignId,
      adSetId: res.body.results.meta.adSetId,
      leadGenFormId: res.body.results.meta.leadGenFormId,
    });
    expect(res.body.ads).toEqual(res.body.results.meta.ads);

    // Supabase rows created — defaults to platform ['meta'] (Phase 2 behavior).
    expect(inserted.ad_campaigns).toHaveLength(1);
    expect(inserted.ad_campaigns[0]).toMatchObject({
      goal: 'lead_gen',
      platforms: ['meta'],
      meta_campaign_id: expect.stringMatching(/^mock_camp_/),
    });
    expect(inserted.ad_creatives).toHaveLength(1);

    // Real Meta API must NOT be called in mock mode.
    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it('omits the Phase 2 top-level shim for a tiktok-only campaign', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', API_KEY)
      .send({ ...validBody, platform: ['tiktok'] });

    expect(res.status).toBe(201);
    expect(res.body.results.tiktok).toMatchObject({
      campaignId: expect.stringMatching(/^mock_tt_camp_/),
      adGroupId: expect.stringMatching(/^mock_tt_adgroup_/),
    });
    expect(res.body.results.meta).toBeUndefined();
    // No Meta result → no legacy top-level mirror.
    expect(res.body.campaignId).toBeUndefined();
    expect(res.body.adSetId).toBeUndefined();
    expect(res.body.ads).toBeUndefined();
  });
});

describe('GET /health', () => {
  it('returns phase 4 status reporting platforms + webhook readiness', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', phase: 4, version: '0.5.3' });
    expect(res.body.features.meta.mockMode).toBe(true);
    expect(res.body.features.tiktok.mockMode).toBe(true);
    expect(res.body.features.webhooks).toMatchObject({
      mockMode: true,
      metaVerifyToken: true,
      tiktokSecret: true,
      notifications: { telegram: false, email: false, lineOA: false },
    });
  });
});
