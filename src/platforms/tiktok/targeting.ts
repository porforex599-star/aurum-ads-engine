import { TiktokApiError } from '../../lib/errors';
import {
  TiktokAgeGroup,
  TiktokGender,
  TiktokTargeting,
  TIKTOK_AGE_GROUPS,
} from './types';

/**
 * ISO 3166-1 alpha-2 → TikTok location id map for the 22 curated countries
 * the frontend exposes. TikTok targeting uses opaque internal location ids
 * (not ISO codes), normally discovered via the Marketing API
 * `GET /tool/region/` endpoint.
 *
 * Source / caveat: Thailand (`6252001`) is seeded from the Phase 3 spec. The
 * remaining values are curated placeholders keyed off GeoNames country ids and
 * MUST be verified against `/tool/region/` for the configured advertiser before
 * flipping TIKTOK_MOCK_MODE=false. They are intentionally distinct per country
 * so the translation layer and its tests are deterministic.
 */
export const TIKTOK_LOCATION_IDS: Record<string, string> = {
  TH: '6252001', // Thailand (per Phase 3 spec)
  SG: '1880251', // Singapore
  MY: '1733045', // Malaysia
  ID: '1643084', // Indonesia
  PH: '1694008', // Philippines
  VN: '1562822', // Vietnam
  JP: '1861060', // Japan
  KR: '1835841', // South Korea
  IN: '1269750', // India
  HK: '1819730', // Hong Kong
  TW: '1668284', // Taiwan
  AE: '290557', // United Arab Emirates
  SA: '102358', // Saudi Arabia
  GB: '2635167', // United Kingdom
  US: '6252002', // United States
  AU: '2077456', // Australia
  CA: '6251999', // Canada
  DE: '2921044', // Germany
  FR: '3017382', // France
  IT: '3175395', // Italy
  ES: '2510769', // Spain
  NZ: '2186224', // New Zealand
};

/** ISO alpha-2 codes for the curated countries we can target on TikTok. */
export const SUPPORTED_TIKTOK_COUNTRIES = Object.keys(TIKTOK_LOCATION_IDS);

/**
 * Translate ISO alpha-2 country codes into TikTok location ids. Throws a
 * structured error for any country outside the curated set so real-mode
 * orchestration fails fast with a clear message instead of sending TikTok a
 * code it cannot interpret.
 */
export function mapCountriesToLocationIds(countries: string[]): string[] {
  const ids: string[] = [];
  const unsupported: string[] = [];
  for (const code of countries) {
    const id = TIKTOK_LOCATION_IDS[code];
    if (id) ids.push(id);
    else unsupported.push(code);
  }
  if (unsupported.length) {
    throw new TiktokApiError(
      `Unsupported TikTok target country/countries: ${unsupported.join(', ')}. ` +
        `Supported: ${SUPPORTED_TIKTOK_COUNTRIES.join(', ')}.`,
      { statusCode: 400, details: { unsupported } }
    );
  }
  return ids;
}

/**
 * Map a continuous [ageMin, ageMax] range onto TikTok's discrete age buckets.
 * A bucket is included when it overlaps the requested range at all.
 */
export function mapAgeRangeToGroups(ageMin: number, ageMax: number): TiktokAgeGroup[] {
  const bounds: Record<TiktokAgeGroup, [number, number]> = {
    AGE_13_17: [13, 17],
    AGE_18_24: [18, 24],
    AGE_25_34: [25, 34],
    AGE_35_44: [35, 44],
    AGE_45_54: [45, 54],
    AGE_55_100: [55, 100],
  };
  const groups = TIKTOK_AGE_GROUPS.filter((g) => {
    const [lo, hi] = bounds[g];
    return ageMin <= hi && ageMax >= lo;
  });
  // Guarantee at least one bucket even for an out-of-range/degenerate input.
  return groups.length ? [...groups] : ['AGE_25_34'];
}

/** Map the spec's gender list onto TikTok's single gender field. */
export function mapGender(genders?: ('male' | 'female')[]): TiktokGender {
  if (!genders?.length || genders.length > 1) return 'GENDER_UNLIMITED';
  return genders[0] === 'male' ? 'GENDER_MALE' : 'GENDER_FEMALE';
}

export interface BuildTargetingInput {
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders?: ('male' | 'female')[];
  /** TikTok interest_category_ids (already resolved); spec interests are names. */
  interestCategoryIds?: string[];
}

/** Assemble a full normalized TikTok targeting payload from spec fields. */
export function buildTiktokTargeting(input: BuildTargetingInput): TiktokTargeting {
  return {
    location_ids: mapCountriesToLocationIds(input.countries),
    age_groups: mapAgeRangeToGroups(input.ageMin, input.ageMax),
    gender: mapGender(input.genders),
    interest_category_ids: input.interestCategoryIds ?? [],
  };
}
