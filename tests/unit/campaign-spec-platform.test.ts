import { CampaignSpecSchema } from '../../src/platforms/meta/types';

// A minimal valid request body; `platform` is overridden per test.
const baseBody = {
  name: 'AURUM_AI_LeadGen_Test_v1',
  dailyBudget: 30000,
  targeting: { ageMin: 28, ageMax: 55, interests: ['Forex'] },
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
      callToActionType: 'LEARN_MORE' as const,
    },
  ],
};

const withPlatform = (platform?: unknown) =>
  platform === undefined ? baseBody : { ...baseBody, platform };

describe('CampaignSpec platform field', () => {
  it('defaults to ["meta"] when omitted (Phase 2 backward compat)', () => {
    const parsed = CampaignSpecSchema.parse(withPlatform());
    expect(parsed.platform).toEqual(['meta']);
  });

  it('accepts platform ["meta"]', () => {
    const parsed = CampaignSpecSchema.parse(withPlatform(['meta']));
    expect(parsed.platform).toEqual(['meta']);
  });

  it('accepts platform ["tiktok"]', () => {
    const parsed = CampaignSpecSchema.parse(withPlatform(['tiktok']));
    expect(parsed.platform).toEqual(['tiktok']);
  });

  it('accepts platform ["meta", "tiktok"] (both)', () => {
    const parsed = CampaignSpecSchema.parse(withPlatform(['meta', 'tiktok']));
    expect(parsed.platform).toEqual(['meta', 'tiktok']);
  });

  it('rejects an empty platform array (min 1)', () => {
    expect(() => CampaignSpecSchema.parse(withPlatform([]))).toThrow();
  });

  it('rejects an invalid platform value', () => {
    expect(() => CampaignSpecSchema.parse(withPlatform(['invalid']))).toThrow();
    expect(() => CampaignSpecSchema.parse(withPlatform(['meta', 'google']))).toThrow();
  });
});
