-- Phase 3 · PR-1 · TikTok Marketing API integration
-- Add TikTok-specific child IDs (parent tiktok_campaign_id already exists).
-- Additive, nullable columns — safe / reversible, no data rewrite.
--
-- Concept mapping (same column purpose, different external naming vs Meta):
--   Meta "Ad Set"    = TikTok "Ad Group"    → tiktok_adgroup_id
--   Meta "Lead Form" = TikTok "Instant Form" → tiktok_leadgen_form_id

alter table public.ad_campaigns
  add column if not exists tiktok_adgroup_id text,
  add column if not exists tiktok_leadgen_form_id text;

alter table public.ad_creatives
  add column if not exists tiktok_creative_id text,
  add column if not exists tiktok_ad_id text;

-- Helpful index for filtering campaigns by platform (platforms TEXT[]).
create index if not exists idx_ad_campaigns_platforms
  on public.ad_campaigns using gin (platforms);
