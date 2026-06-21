import axios from 'axios';
import { config } from '../../config';

/**
 * Meta configuration health diagnostics.
 *
 * Exercises the four real-world failure modes that have blocked the first live
 * campaign launch (page not in token scope, user-vs-page token, pixel/business
 * mismatch, lead-form access) plus the surrounding env/token/ad-account checks.
 *
 * Every individual check is wrapped so a single failed Graph call never throws
 * the whole report — the endpoint always returns a structured verdict.
 */

export const ENGINE_VERSION = '0.5.4';

/** Injectable Graph GET so the report can be unit-tested with stubbed responses. */
export type GraphGet = (path: string, params: Record<string, unknown>) => Promise<any>;

/** Required env vars (presence is reported; the optional ones don't fail `ok`). */
const REQUIRED_ENV_KEYS = [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_BUSINESS_ID',
  'META_PAGE_ID',
  'META_PIXEL_ID',
  'META_AD_ACCOUNT_ID',
  'META_PAGE_ACCESS_TOKEN',
  'META_WEBHOOK_VERIFY_TOKEN',
] as const;

/** Reported for visibility but never fail the verdict (both have safe defaults). */
const OPTIONAL_ENV_KEYS = ['META_MOCK_MODE', 'META_SPECIAL_AD_CATEGORIES'] as const;

const REQUIRED_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'leads_retrieval',
] as const;

/** Scopes that the Graph API Explorer flow commonly cannot grant. */
const HARD_TO_GRANT_SCOPES = ['pages_manage_metadata', 'leads_retrieval'];

function graphErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message || e?.message || 'Graph request failed';
}

function defaultGraphGet(): GraphGet {
  const http = axios.create({
    baseURL: `${config.meta.apiBaseUrl}/${config.meta.apiVersion}`,
    timeout: 15_000,
  });
  return async (path, params) => {
    const res = await http.get(path, { params });
    return res.data;
  };
}

function adAccountPath(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkEnvVars() {
  const present: Record<string, number> = {};
  const missing: string[] = [];
  for (const key of [...REQUIRED_ENV_KEYS, ...OPTIONAL_ENV_KEYS]) {
    const val = process.env[key];
    present[key] = val ? val.length : 0;
    if ((REQUIRED_ENV_KEYS as readonly string[]).includes(key) && !val) {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0, missing, present };
}

async function checkToken(graphGet: GraphGet) {
  const token = config.meta.pageAccessToken;
  const appId = config.meta.appId;
  const appSecret = config.meta.appSecret;
  if (!token || !appId || !appSecret) {
    return {
      ok: false,
      error: 'Missing META_PAGE_ACCESS_TOKEN, META_APP_ID or META_APP_SECRET',
    };
  }
  try {
    const res = await graphGet('/debug_token', {
      input_token: token,
      access_token: `${appId}|${appSecret}`,
    });
    const d = res?.data ?? {};
    const type = (d.type ?? 'UNKNOWN').toString().toUpperCase();
    const isValid = Boolean(d.is_valid);
    const expiresAtUnix: number | undefined = d.expires_at;
    const expiresAt =
      expiresAtUnix && expiresAtUnix > 0 ? new Date(expiresAtUnix * 1000).toISOString() : null;
    const granularScopes = Array.isArray(d.granular_scopes)
      ? d.granular_scopes.map((g: { scope: string; target_ids?: string[] }) => ({
          scope: g.scope,
          targetIds: g.target_ids?.length ?? 0,
        }))
      : [];
    return {
      ok: isValid && type !== 'APP',
      appId: d.app_id,
      type,
      isValid,
      expiresAt,
      scopes: (d.scopes ?? []) as string[],
      userId: d.user_id,
      granularScopes,
    };
  } catch (err) {
    return { ok: false, error: graphErrorMessage(err) };
  }
}

function checkScopeCoverage(scopes: string[]) {
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  const hardMissing = missing.filter((s) => HARD_TO_GRANT_SCOPES.includes(s));
  const remediation = hardMissing.length
    ? `Scope(s) ${hardMissing.join(', ')} are hard to grant via Graph API Explorer. ` +
      'Add them with a System User token (Business Settings → System Users) or via App Review.'
    : undefined;
  return {
    ok: missing.length === 0,
    missing,
    ...(remediation ? { remediation } : {}),
  };
}

async function checkPages(graphGet: GraphGet) {
  const configuredPageId = config.meta.pageId ?? null;
  try {
    const res = await graphGet('/me/accounts', {
      fields: 'id,name,access_token',
      limit: 200,
      access_token: config.meta.pageAccessToken,
    });
    const data: { id: string; name: string; access_token?: string }[] = res?.data ?? [];
    const pages = data.map((p) => ({ id: p.id, name: p.name, hasAccessToken: Boolean(p.access_token) }));
    const found = configuredPageId ? pages.find((p) => p.id === configuredPageId) : undefined;
    const foundInScope = Boolean(found);
    return {
      ok: foundInScope,
      mismatch: !foundInScope,
      configuredPageId,
      foundInScope,
      pageAccessTokenAvailable: Boolean(found?.hasAccessToken),
      count: pages.length,
      sample: pages.slice(0, 10).map((p) => ({ id: p.id, name: p.name })),
    };
  } catch (err) {
    return {
      ok: false,
      mismatch: true,
      configuredPageId,
      foundInScope: false,
      error: graphErrorMessage(err),
    };
  }
}

async function checkAdAccount(graphGet: GraphGet) {
  const id = config.meta.adAccountId;
  const businessId = config.meta.businessId;
  if (!id) return { ok: false, error: 'META_AD_ACCOUNT_ID not configured' };
  try {
    const res = await graphGet(`/${adAccountPath(id)}`, {
      fields:
        'id,name,account_status,currency,timezone_name,business,funding_source_details,disable_reason',
      access_token: config.meta.pageAccessToken,
    });
    const ownerBusinessId = res?.business?.id ?? null;
    const businessIdMatches = Boolean(businessId) && ownerBusinessId === businessId;
    const status = res?.account_status;
    return {
      ok: status === 1 && businessIdMatches,
      status,
      currency: res?.currency,
      timezoneName: res?.timezone_name,
      businessIdMatches,
      ownerBusinessId,
      fundingSource: res?.funding_source_details?.display_string ?? null,
      disableReason: res?.disable_reason ?? null,
    };
  } catch (err) {
    return { ok: false, error: graphErrorMessage(err) };
  }
}

async function checkPixel(graphGet: GraphGet) {
  const pixelId = config.meta.pixelId;
  const businessId = config.meta.businessId;
  if (!pixelId) return { ok: false, error: 'META_PIXEL_ID not configured' };
  try {
    const res = await graphGet(`/${pixelId}`, {
      fields: 'id,name,owner_business,owner_ad_account,code',
      access_token: config.meta.pageAccessToken,
    });
    const ownerBusinessId = res?.owner_business?.id ?? null;
    const businessIdMatches = Boolean(businessId) && ownerBusinessId === businessId;
    return {
      ok: businessIdMatches,
      name: res?.name ?? null,
      businessIdMatches,
      ownerBusinessId,
      ownerAdAccountId: res?.owner_ad_account?.id ?? null,
    };
  } catch (err) {
    return { ok: false, error: graphErrorMessage(err) };
  }
}

async function checkPage(graphGet: GraphGet, runIt: boolean) {
  const pageId = config.meta.pageId;
  if (!runIt) {
    return { ok: false, skipped: true, reason: 'META_PAGE_ID not found in token scope' };
  }
  if (!pageId) return { ok: false, error: 'META_PAGE_ID not configured' };
  try {
    const res = await graphGet(`/${pageId}`, {
      fields: 'id,name,category,access_token,tasks',
      access_token: config.meta.pageAccessToken,
    });
    const tasks: string[] = res?.tasks ?? [];
    const hasAdvertiseTask = tasks.includes('ADVERTISE');
    const hasManageTask = tasks.includes('MANAGE');
    return {
      ok: hasAdvertiseTask && hasManageTask,
      name: res?.name ?? null,
      category: res?.category ?? null,
      tasks,
      hasAdvertiseTask,
      hasManageTask,
    };
  } catch (err) {
    return { ok: false, error: graphErrorMessage(err) };
  }
}

async function checkLeadForms(graphGet: GraphGet, runIt: boolean) {
  const pageId = config.meta.pageId;
  if (!runIt) {
    return { ok: false, skipped: true, reason: 'META_PAGE_ID not found in token scope' };
  }
  if (!pageId) return { ok: false, error: 'META_PAGE_ID not configured' };
  try {
    const res = await graphGet(`/${pageId}/leadgen_forms`, {
      limit: 5,
      access_token: config.meta.pageAccessToken,
    });
    const forms: unknown[] = res?.data ?? [];
    return { ok: true, count: forms.length }; // empty list is fine
  } catch (err) {
    return { ok: false, error: graphErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function runMetaDiagnostics(graphGet: GraphGet = defaultGraphGet()) {
  const envVars = checkEnvVars();
  const token = await checkToken(graphGet);
  const scopeCoverage = checkScopeCoverage('scopes' in token ? token.scopes ?? [] : []);
  const pages = await checkPages(graphGet);
  const adAccount = await checkAdAccount(graphGet);
  const pixel = await checkPixel(graphGet);
  const page = await checkPage(graphGet, pages.foundInScope);
  const leadForms = await checkLeadForms(graphGet, pages.foundInScope);

  const checks = {
    envVars,
    token,
    'token.scopeCoverage': scopeCoverage,
    pages,
    adAccount,
    pixel,
    page,
    leadForms,
  };

  const ok = Object.values(checks).every((c) => c.ok);

  return {
    ok,
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    checks,
  };
}
