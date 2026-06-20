import { z } from 'zod';

// ---------------------------------------------------------------------------
// Meta Graph API primitive payload types
// ---------------------------------------------------------------------------

export type MetaStatus = 'PAUSED' | 'ACTIVE';
export type CallToActionType = 'LEARN_MORE' | 'SIGN_UP';

export interface MetaIdResponse {
  id: string;
}

export interface MetaImageHashResponse {
  hash: string;
}

export interface MetaTargeting {
  geoLocations: { countries: string[] };
  ageMin: number;
  ageMax: number;
  genders?: number[]; // 1 = male, 2 = female
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  locales?: number[]; // Thai = 6
}

export interface MetaCampaignStatus {
  id: string;
  status: string;
  effectiveStatus: string;
  /** Normalized to live | paused | error | unknown */
  normalized: 'live' | 'paused' | 'error' | 'unknown';
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// High-level Campaign spec (the public API request body) + Zod validation
// ---------------------------------------------------------------------------

export const CampaignSpecSchema = z.object({
  name: z.string().min(1),
  // Which ad platform(s) to create the campaign on. An array so a single spec
  // can fan out to multiple platforms (e.g. ['meta','tiktok'] = create on both).
  // Defaults to ['meta'] so Phase 2 callers that omit the field are unchanged.
  platform: z.array(z.enum(['meta', 'tiktok'])).min(1).default(['meta']),
  dailyBudget: z.number().int().positive(), // smallest currency unit (THB satang)
  targeting: z.object({
    ageMin: z.number().int().min(13).max(65),
    ageMax: z.number().int().min(13).max(65),
    genders: z.array(z.enum(['male', 'female'])).optional(),
    interests: z.array(z.string()).default([]),
    // ISO 3166-1 alpha-2 country codes (uppercase). Forwarded to Meta
    // targeting.geo_locations.countries. Defaults to ['TH'] for backward
    // compat with callers that don't send the field.
    countries: z
      .array(z.string().length(2).regex(/^[A-Z]{2}$/))
      .min(1)
      .default(['TH']),
  }),
  schedule: z.object({
    startTime: z.string().min(1), // ISO 8601
    endTime: z.string().optional(),
  }),
  leadGenForm: z.object({
    headline: z.string().min(1),
    description: z.string().min(1),
    customQuestion: z
      .object({
        label: z.string().min(1),
        options: z.array(z.string().min(1)).min(1),
      })
      .optional(),
    privacyPolicyUrl: z.string().url(),
    thankYouTitle: z.string().min(1),
    thankYouBody: z.string().min(1),
    thankYouButtonText: z.string().min(1),
    thankYouButtonUrl: z.string().url(),
  }),
  ads: z
    .array(
      z.object({
        name: z.string().min(1),
        imageUrl: z.string().url(),
        primaryText: z.string().min(1),
        headline: z.string().min(1),
        description: z.string().optional(),
        callToActionType: z.enum(['LEARN_MORE', 'SIGN_UP']).default('LEARN_MORE'),
      })
    )
    .min(1),
  /** When true, the campaign is flipped to ACTIVE after the chain is built. */
  autoActivate: z.boolean().default(false),
});

export type CampaignSpec = z.infer<typeof CampaignSpecSchema>;
export type Platform = CampaignSpec['platform'][number];

export interface OrchestrationResult {
  campaignId: string;
  adSetId: string;
  leadGenFormId: string;
  ads: { id: string; name: string; creativeId: string }[];
  dbCampaignId: string;
}

/** Public per-platform result returned by each platform orchestrator. */
export interface MetaPlatformResult {
  campaignId: string;
  adSetId: string;
  leadGenFormId: string;
  ads: { id: string; name: string; creativeId: string }[];
}

export interface TiktokPlatformResult {
  campaignId: string;
  adGroupId: string;
  leadGenFormId: string;
  ads: { id: string; name: string; creativeId: string }[];
}

export interface PlatformResults {
  meta?: MetaPlatformResult;
  tiktok?: TiktokPlatformResult;
}

/** Combined result of a (possibly multi-platform) orchestration. */
export interface MultiPlatformOrchestrationResult {
  dbCampaignId: string;
  results: PlatformResults;
}
