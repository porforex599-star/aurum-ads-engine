import { metaClient, MetaClient, randomId } from './client';
import { MetaIdResponse, MetaStatus } from './types';

export interface CreateCampaignInput {
  name: string;
  objective?: 'OUTCOME_LEADS';
  specialAdCategories?: string[];
  status: MetaStatus;
}

/** Shape of the Graph API campaign-create request body. */
export interface MetaCampaignCreateBody {
  name: string;
  objective: string;
  status: MetaStatus;
  special_ad_categories: string[];
  is_adset_budget_sharing_enabled: boolean;
  // Index signature so the body is assignable to the client's
  // Record<string, unknown> payload parameter.
  [key: string]: unknown;
}

/**
 * Meta's allowed special-ad-category enum values. Note that enum-validity does
 * not imply operational eligibility: restricted categories (e.g.
 * FINANCIAL_PRODUCTS_AND_SERVICES) require the Ad Account to be registered under
 * Meta's special-ads program, which Thai-region accounts are not auto-granted.
 */
const ALLOWED_CATEGORIES = new Set([
  'NONE',
  'EMPLOYMENT',
  'HOUSING',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
  'FINANCIAL_PRODUCTS_AND_SERVICES',
]);

/**
 * Resolve the special_ad_categories value for a campaign-create payload.
 *
 * Defaults to ['NONE'] — the correct classification for AURUM, which is
 * positioned as educational gold-market analysis, not a financial product.
 * Override via META_SPECIAL_AD_CATEGORIES (comma-separated) only if the Ad
 * Account has been registered under Meta's special-ads program for that
 * category. Invalid tokens are dropped; empty / all-invalid falls back to
 * ['NONE'] (fail-open to the safe default).
 */
export function getSpecialAdCategories(): string[] {
  const raw = process.env.META_SPECIAL_AD_CATEGORIES;
  if (!raw) return ['NONE'];
  const tokens = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const valid = tokens.filter((t) => ALLOWED_CATEGORIES.has(t));
  if (valid.length === 0) return ['NONE'];
  return valid;
}

/**
 * Resolve is_adset_budget_sharing_enabled for a campaign-create payload.
 *
 * Meta now requires this boolean on POST /act_{id}/campaigns for lead-gen
 * objectives when the campaign is NOT using Campaign Budget Optimization (CBO).
 * AURUM uses adset-level daily budgets (each adset has its own daily_budget),
 * so the canonical value is `false` — adsets do NOT share budget. Set
 * META_CAMPAIGN_BUDGET_SHARING_ENABLED=true to opt into CBO behaviour (adsets
 * share 20% of budget for overall optimization) without a code change.
 */
export function getBudgetSharingEnabled(): boolean {
  return process.env.META_CAMPAIGN_BUDGET_SHARING_ENABLED === 'true';
}

/**
 * Create a Lead Generation campaign.
 * POST /{ad_account_id}/campaigns
 *
 * The special ad category is locked in at creation and cannot be changed
 * afterwards — see Meta Special Ad Categories docs. AURUM defaults to ['NONE'];
 * see getSpecialAdCategories() for the override mechanism.
 */
export async function createMetaCampaign(
  input: CreateCampaignInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const body: MetaCampaignCreateBody = {
    name: input.name,
    objective: input.objective ?? 'OUTCOME_LEADS',
    status: input.status,
    special_ad_categories: input.specialAdCategories ?? getSpecialAdCategories(),
    // Meta requires this boolean for non-CBO lead-gen campaigns. Defaults to
    // false (adset-level budgets, no sharing); see getBudgetSharingEnabled().
    is_adset_budget_sharing_enabled: getBudgetSharingEnabled(),
    // NOTE: bid_strategy lives on the AD SET, not here — AURUM uses ABO
    // (adset-level budgets), and Meta requires bid_strategy at the budget level.
    // See getBidStrategy() in ./bid-strategy and createMetaAdSet().
  };
  return client.post<MetaIdResponse>(`/${client.adAccountPath}/campaigns`, body, () => ({
    id: `mock_camp_${randomId()}`,
  }));
}
