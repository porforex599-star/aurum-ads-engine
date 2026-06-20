import { z } from 'zod';

// ---------------------------------------------------------------------------
// TikTok Marketing API primitive payload types
// ---------------------------------------------------------------------------

/** Campaign delivery status. DISABLE == paused/draft, ENABLE == live. */
export type TiktokOperationStatus = 'ENABLE' | 'DISABLE';

/**
 * TikTok wraps every response in a code/message envelope. `code === 0` means
 * success; any other code is an API error (even on HTTP 200).
 */
export interface TiktokEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

/** TikTok age buckets (the API does not accept raw min/max ages). */
export const TIKTOK_AGE_GROUPS = [
  'AGE_13_17',
  'AGE_18_24',
  'AGE_25_34',
  'AGE_35_44',
  'AGE_45_54',
  'AGE_55_100',
] as const;
export type TiktokAgeGroup = (typeof TIKTOK_AGE_GROUPS)[number];

export const TiktokAgeGroupSchema = z.enum(TIKTOK_AGE_GROUPS);

/** TikTok gender targeting values. */
export const TIKTOK_GENDERS = ['GENDER_MALE', 'GENDER_FEMALE', 'GENDER_UNLIMITED'] as const;
export type TiktokGender = (typeof TIKTOK_GENDERS)[number];

export const TiktokGenderSchema = z.enum(TIKTOK_GENDERS);

/** Normalized TikTok targeting payload sent to /adgroup/create/. */
export const TiktokTargetingSchema = z.object({
  location_ids: z.array(z.string()).min(1),
  age_groups: z.array(TiktokAgeGroupSchema).min(1),
  gender: TiktokGenderSchema,
  interest_category_ids: z.array(z.string()).default([]),
});
export type TiktokTargeting = z.infer<typeof TiktokTargetingSchema>;

export interface TiktokCampaign {
  campaign_id: string;
  advertiser_id: string;
  campaign_name: string;
  objective_type: 'LEAD_GENERATION';
  status: TiktokOperationStatus;
  create_time: string;
}

export interface TiktokCampaignStatus {
  id: string;
  status: string;
  /** Normalized to live | paused | error | unknown (mirrors Meta's buckets). */
  normalized: 'live' | 'paused' | 'error' | 'unknown';
  raw?: unknown;
}
