# Changelog

All notable changes to `aurum-ads-engine` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-06-21
### Fixed
- `POST /act_{ad_account_id}/campaigns` now sends
  `is_adset_budget_sharing_enabled: false` by default. Meta recently
  began requiring this field as a boolean for non-CBO lead-gen
  campaigns; omitting it caused all live campaign creates to fail with
  the Thai-localized "is_adset_budget_sharing_enabled" error.
### Added
- `META_CAMPAIGN_BUDGET_SHARING_ENABLED` env var (default `false`).
  Set to `true` to enable Campaign Budget Optimization with 20% adset
  budget sharing.

## [0.5.0] - 2026-06-21
### Added
- `GET /api/v1/diag/meta` — health endpoint that validates env vars, token
  scopes, page-in-scope, ad-account ownership, pixel ownership, page tasks,
  and lead-form read. Returns a structured verdict so misconfiguration can
  be diagnosed without reading server logs.
- `MetaApiError` — preserves Meta's `error_user_msg`, `error_subcode`,
  `fbtrace_id`, `error_data`, the request path and the redacted request
  payload. Token/secret-shaped keys (`/token|secret|key/i`) are redacted to
  `[REDACTED]` before logging or response forwarding.
- `META_DEBUG_PAYLOADS` env var — off by default; when `1`, logs each
  outbound Meta request's redacted payload.

### Changed
- `POST /api/ads/campaigns` failure response now carries `details.metaError`
  with the upstream Graph API error detail. Status code flips 500 → 502
  when the failure originated from Meta (not our orchestrator).
- `meta.error` log line is now structured with `fbtraceId`, `stepKey`,
  `userMsg`, `userTitle`, redacted `requestPayload`, and the full raw
  Graph error object.

## [0.4.2] - 2026-06-21

### Fixed

- `special_ad_categories` default flipped from
  `['FINANCIAL_PRODUCTS_AND_SERVICES']` → `['NONE']`. Meta rejects the former
  for Thai Ad Accounts not registered under the special-ads financial-services
  program, which AURUM is not (positioned as educational analysis, not a
  financial product).

### Added

- `META_SPECIAL_AD_CATEGORIES` env var (comma-separated). Defaults to `NONE`.
  Invalid tokens are dropped; empty / all-invalid → `['NONE']`.
- Test coverage for the new helper (5 cases).

## [0.4.1]

### Fixed

- `display_name` now persisted from `/api/v1/webhooks/test` request body
  (read via `display_name` → `full_name` → `name` fallback).
- `source_campaign_id` correctly resolves for both Meta and TikTok platforms
  via the per-platform `ad_campaigns` id column (`platformCampaignId` in the
  `/test` body). Unresolved campaign ids are breadcrumbed in
  `tags.platform_campaign_id_unresolved`.
