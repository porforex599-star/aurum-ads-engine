import { CampaignSpecSchema } from '../../src/platforms/meta/types';

// A minimal valid request body; individual tests override `targeting`.
const baseBody = {
  name: 'AURUM_AI_LeadGen_Test_v1',
  dailyBudget: 30000,
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

const withTargeting = (targeting: Record<string, unknown>) => ({
  ...baseBody,
  targeting: { ageMin: 28, ageMax: 55, interests: ['Forex'], ...targeting },
});

describe('CampaignSpec targeting.countries', () => {
  it('accepts a valid uppercase ISO alpha-2 array', () => {
    const parsed = CampaignSpecSchema.parse(withTargeting({ countries: ['TH', 'JP', 'US'] }));
    expect(parsed.targeting.countries).toEqual(['TH', 'JP', 'US']);
  });

  it('defaults to ["TH"] when omitted (backward compat)', () => {
    const parsed = CampaignSpecSchema.parse(withTargeting({}));
    expect(parsed.targeting.countries).toEqual(['TH']);
  });

  it('rejects lowercase country codes', () => {
    expect(() => CampaignSpecSchema.parse(withTargeting({ countries: ['th'] }))).toThrow();
  });

  it('rejects 3-letter country codes', () => {
    expect(() => CampaignSpecSchema.parse(withTargeting({ countries: ['THA'] }))).toThrow();
  });

  it('rejects an empty countries array', () => {
    expect(() => CampaignSpecSchema.parse(withTargeting({ countries: [] }))).toThrow();
  });
});
