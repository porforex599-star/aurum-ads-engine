// Phase 1 · PR-1 · Webhook runtime configuration.
//
// Read lazily from process.env on every call (rather than the frozen Zod
// config singleton) so the value can be toggled per-test and per-request.
// META_APP_SECRET / META_PAGE_ACCESS_TOKEN are reused from the Phase 2 Meta
// integration for HMAC verification + the Graph API lead fetch.

function truthy(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export type WebhookConfig = {
  mockMode: boolean;
  metaVerifyToken: string;
  metaAppSecret: string;
  metaAccessToken: string;
  metaApiBaseUrl: string;
  metaApiVersion: string;
  tiktokSecret: string;
};

export function getWebhookConfig(): WebhookConfig {
  return {
    mockMode: truthy(process.env.WEBHOOK_MOCK_MODE, true),
    metaVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
    metaAppSecret: process.env.META_APP_SECRET ?? '',
    metaAccessToken: process.env.META_PAGE_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN ?? '',
    metaApiBaseUrl: process.env.META_API_BASE_URL ?? 'https://graph.facebook.com',
    metaApiVersion: process.env.META_API_VERSION ?? 'v23.0',
    tiktokSecret: process.env.TIKTOK_WEBHOOK_SECRET ?? '',
  };
}
