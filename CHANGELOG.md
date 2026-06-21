# Changelog

All notable changes to `aurum-ads-engine` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
