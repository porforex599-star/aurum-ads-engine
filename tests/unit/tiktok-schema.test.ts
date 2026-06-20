import {
  TiktokTargetingSchema,
  TiktokAgeGroupSchema,
  TiktokGenderSchema,
} from '../../src/platforms/tiktok/types';
import {
  mapAgeRangeToGroups,
  mapGender,
  mapCountriesToLocationIds,
  buildTiktokTargeting,
  TIKTOK_LOCATION_IDS,
  SUPPORTED_TIKTOK_COUNTRIES,
} from '../../src/platforms/tiktok/targeting';
import { TiktokApiError } from '../../src/lib/errors';

describe('TikTok schemas', () => {
  it('accepts a well-formed targeting payload', () => {
    const parsed = TiktokTargetingSchema.parse({
      location_ids: ['6252001'],
      age_groups: ['AGE_25_34', 'AGE_35_44'],
      gender: 'GENDER_UNLIMITED',
      interest_category_ids: [],
    });
    expect(parsed.location_ids).toEqual(['6252001']);
  });

  it('rejects an unknown age group', () => {
    expect(() => TiktokAgeGroupSchema.parse('AGE_99_100')).toThrow();
  });

  it('rejects an unknown gender', () => {
    expect(() => TiktokGenderSchema.parse('MALE')).toThrow();
  });

  it('rejects targeting with no location ids', () => {
    expect(() =>
      TiktokTargetingSchema.parse({ location_ids: [], age_groups: ['AGE_25_34'], gender: 'GENDER_UNLIMITED' })
    ).toThrow();
  });
});

describe('age bucket mapping', () => {
  it('maps a 28-55 range to the overlapping buckets', () => {
    expect(mapAgeRangeToGroups(28, 55)).toEqual(['AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100']);
  });

  it('maps a single young bucket', () => {
    expect(mapAgeRangeToGroups(18, 24)).toEqual(['AGE_18_24']);
  });

  it('includes the 13-17 bucket at the low edge', () => {
    expect(mapAgeRangeToGroups(13, 16)).toEqual(['AGE_13_17']);
  });

  it('falls back to a default bucket for a degenerate range', () => {
    expect(mapAgeRangeToGroups(200, 300)).toEqual(['AGE_25_34']);
  });
});

describe('gender mapping', () => {
  it('maps a single gender', () => {
    expect(mapGender(['male'])).toBe('GENDER_MALE');
    expect(mapGender(['female'])).toBe('GENDER_FEMALE');
  });

  it('maps empty/both to unlimited', () => {
    expect(mapGender(undefined)).toBe('GENDER_UNLIMITED');
    expect(mapGender([])).toBe('GENDER_UNLIMITED');
    expect(mapGender(['male', 'female'])).toBe('GENDER_UNLIMITED');
  });
});

describe('country → TikTok location id translation', () => {
  it('translates Thailand to its TikTok location id', () => {
    expect(mapCountriesToLocationIds(['TH'])).toEqual(['6252001']);
  });

  it('translates several supported countries', () => {
    expect(mapCountriesToLocationIds(['TH', 'SG', 'JP'])).toEqual([
      TIKTOK_LOCATION_IDS.TH,
      TIKTOK_LOCATION_IDS.SG,
      TIKTOK_LOCATION_IDS.JP,
    ]);
  });

  it('exposes 22 curated countries', () => {
    expect(SUPPORTED_TIKTOK_COUNTRIES).toHaveLength(22);
  });

  it('throws a structured error for an unsupported country in real mode', () => {
    expect(() => mapCountriesToLocationIds(['XX'])).toThrow(TiktokApiError);
    try {
      mapCountriesToLocationIds(['TH', 'XX']);
    } catch (err) {
      expect(err).toBeInstanceOf(TiktokApiError);
      expect((err as TiktokApiError).statusCode).toBe(400);
    }
  });
});

describe('buildTiktokTargeting', () => {
  it('assembles a full normalized targeting payload that validates', () => {
    const targeting = buildTiktokTargeting({
      countries: ['TH', 'SG'],
      ageMin: 28,
      ageMax: 55,
      genders: ['male'],
    });
    expect(() => TiktokTargetingSchema.parse(targeting)).not.toThrow();
    expect(targeting.gender).toBe('GENDER_MALE');
    expect(targeting.location_ids).toEqual([TIKTOK_LOCATION_IDS.TH, TIKTOK_LOCATION_IDS.SG]);
  });
});
