-- Phase 2 · PR-1 · Meta Marketing API integration
-- Additive, nullable columns to persist the full Meta lead-gen chain IDs.
-- Safe / reversible: no data rewrite, no constraint changes.

alter table public.ad_campaigns
  add column if not exists meta_adset_id text,
  add column if not exists meta_leadgen_form_id text;

alter table public.ad_creatives
  add column if not exists meta_creative_id text,
  add column if not exists meta_ad_id text,
  add column if not exists image_hash text;
