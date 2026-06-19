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
  dailyBudget: z.number().int().positive(), // smallest currency unit (THB satang)
  targeting: z.object({
    ageMin: z.number().int().min(13).max(65),
    ageMax: z.number().int().min(13).max(65),
    genders: z.array(z.enum(['male', 'female'])).optional(),
    interests: z.array(z.string()).default([]),
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

export interface OrchestrationResult {
  campaignId: string;
  adSetId: string;
  leadGenFormId: string;
  ads: { id: string; name: string; creativeId: string }[];
  dbCampaignId: string;
}
