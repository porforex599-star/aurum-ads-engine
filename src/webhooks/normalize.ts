// Phase 1 · PR-1 · Platform payload → unified NormalizedLead.
//
// Meta only sends a leadgen_id in the webhook, so we fetch the full lead from
// the Graph API first. TikTok includes field_data inline, so no second call.
// Contact-field lookup is case-insensitive and tolerant of common name
// variations across lead forms.

import { getWebhookConfig } from './config';
import { MetaLeadDetail, NormalizedLead, TiktokWebhookBody } from './types';

const EMAIL_KEYS = ['email', 'email_address', 'e-mail', 'mail', 'work_email'];
const PHONE_KEYS = ['phone_number', 'phone', 'mobile', 'mobile_number', 'tel', 'telephone', 'phone_no'];
const FULLNAME_KEYS = ['full_name', 'name', 'fullname', 'full name', 'your_name'];
const FIRST_KEYS = ['first_name', 'firstname', 'given_name', 'first name'];
const LAST_KEYS = ['last_name', 'lastname', 'family_name', 'last name'];

function pick(fields: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fields.get(key);
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function buildContact(fields: Map<string, string>): {
  email?: string;
  phone?: string;
  displayName?: string;
} {
  const email = pick(fields, EMAIL_KEYS);
  const phone = pick(fields, PHONE_KEYS);
  let displayName = pick(fields, FULLNAME_KEYS);
  if (!displayName) {
    const first = pick(fields, FIRST_KEYS);
    const last = pick(fields, LAST_KEYS);
    const joined = [first, last].filter(Boolean).join(' ').trim();
    if (joined) displayName = joined;
  }
  return { email, phone, displayName };
}

/** Lowercase every form field name so lookups are case-insensitive. */
function toFieldMap(
  entries: Array<{ name?: string; value?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.name) map.set(entry.name.toLowerCase().trim(), entry.value ?? '');
  }
  return map;
}

/**
 * For Meta: fetch the full lead from the Graph API (the webhook only carries a
 * leadgen_id), then normalize. Throws if the Graph API call fails so the caller
 * can log + skip without persisting a half-empty lead.
 */
export async function normalizeMetaLead(
  leadgenId: string,
  accessToken: string
): Promise<NormalizedLead> {
  const cfg = getWebhookConfig();
  const fields = 'field_data,ad_id,campaign_id,form_id,created_time';
  const url =
    `${cfg.metaApiBaseUrl}/${cfg.metaApiVersion}/${encodeURIComponent(leadgenId)}` +
    `?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meta Graph API lead fetch failed (${res.status}): ${text}`);
  }
  const detail = (await res.json()) as MetaLeadDetail;

  const fieldMap = toFieldMap(
    (detail.field_data ?? []).map((f) => ({ name: f.name, value: (f.values ?? [])[0] ?? '' }))
  );
  const contact = buildContact(fieldMap);

  return {
    platform: 'meta',
    platformLeadId: leadgenId,
    platformAdId: detail.ad_id ?? '',
    platformCampaignId: detail.campaign_id ?? '',
    platformFormId: detail.form_id ?? '',
    ...contact,
    utm: {
      source: 'facebook',
      medium: 'paid_social',
      campaign: detail.campaign_id ?? '',
    },
    rawPayload: detail,
    receivedAt: new Date(),
  };
}

/** For TikTok: the webhook payload already contains everything we need. */
export function normalizeTiktokLead(payload: unknown): NormalizedLead {
  const body = (payload ?? {}) as TiktokWebhookBody;
  const data = body.data ?? {};

  const fieldMap = toFieldMap(
    (data.field_data ?? []).map((f) => ({ name: f.field_name, value: f.value }))
  );
  const contact = buildContact(fieldMap);

  return {
    platform: 'tiktok',
    platformLeadId: data.lead_id ?? '',
    platformAdId: data.ad_id ?? '',
    platformCampaignId: data.campaign_id ?? '',
    platformFormId: data.form_id ?? '',
    ...contact,
    utm: {
      source: 'tiktok',
      medium: 'paid_social',
      campaign: data.campaign_id ?? '',
    },
    rawPayload: payload,
    receivedAt: new Date(),
  };
}
