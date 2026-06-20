-- Phase 1 · PR-1 · Lead capture webhooks (Meta + TikTok)
-- Idempotency + attribution indexes for the leads table.
--
-- The webhook normalizer writes tags as a JSON OBJECT (not an array) so that
-- the partial unique index below can key off tags->>'source_lead_id'. Each
-- inbound lead carries:
--   tags = { "source_lead_id": "<leadgen_id|lead_id>", "source_platform": "meta|tiktok", ... }
--
-- source_platform stored values follow the existing CHECK constraint
-- ('facebook' | 'instagram' | 'tiktok' | ...). Meta lead-ads are stored as
-- 'facebook' (the leads table has no 'meta' enum value).
--
-- Additive + reversible: only creates indexes, no data rewrite.

-- Unique index for webhook idempotency. A retried webhook (same platform lead
-- id) can never create a second row.
create unique index if not exists idx_leads_platform_lead_id
  on public.leads ((tags->>'source_lead_id'), source_platform)
  where tags->>'source_lead_id' is not null;

-- Index for fast campaign attribution lookups (filter leads by campaign).
create index if not exists idx_leads_source_campaign
  on public.leads (source_campaign_id)
  where source_campaign_id is not null;
