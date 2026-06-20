# aurum-ads-engine

Marketing automation backend for AURUM ecosystem.

## Scope
- Unified inbox: LINE OA + Meta (FB/IG) + TikTok DM capture
- Reply via Messaging APIs (LINE/Meta direct from Aurum-Admin /leads)
- Sales flow templates + scheduler
- Media library (Supabase Storage)
- Cross-platform ads (LINE LAP + Meta + TikTok + Google)
- Custom Audiences + retargeting from CRM
- Creative AI (Thai copy gen) + cross-platform attribution

## Status: Phase 1 · PR-1 (Lead capture webhooks · Meta + TikTok)

The engine now receives lead-ad callbacks from Meta (Facebook Lead Ads) and
TikTok (Lead Generation), verifies their signatures, resolves AURUM campaign
attribution, persists into `public.leads` (idempotently), and fires async
notifications (Telegram + Email + LINE OA). `/health` reports `phase: 4`,
`version: 0.4.0`, and webhook + notification readiness. See the
[Webhooks](#webhooks) section below and `docs/PHASE1_WEBHOOK_SETUP.md`.

## Previously: Phase 3 · PR-1 (TikTok Marketing API · platform-aware orchestrator)

Phase 3 adds TikTok Marketing API lead-gen alongside Meta. A single campaign
spec can target Meta, TikTok, or both via the `platform` field; the orchestrator
builds each platform independently and persists every returned ID.

### Endpoints
All `/api/v1/*` routes require an `X-API-Key` header matching `AURUM_ADS_ENGINE_API_KEY`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/v1/campaigns` | Create the full lead-gen chain on the requested platform(s) and persist to Supabase |
| GET | `/api/v1/campaigns` | List recent campaigns |
| GET | `/api/v1/campaigns/:id` | Single campaign with its creatives |
| GET | `/api/v1/campaigns/:id/status` | Live delivery status across each platform used (live/paused/error) |

`/health` reports `phase: 3`, `version: 0.3.0`, and per-platform mock-mode state
for both `meta` and `tiktok`.

#### Platform selection
`POST /api/v1/campaigns` accepts a `platform` array:

- omitted → `["meta"]` (Phase 2 behavior, unchanged)
- `["meta"]` · `["tiktok"]` · `["meta","tiktok"]` (both)

Response shape:
```json
{
  "dbCampaignId": "…",
  "results": {
    "meta":   { "campaignId": "…", "adSetId": "…", "leadGenFormId": "…", "ads": [ … ] },
    "tiktok": { "campaignId": "…", "adGroupId": "…", "leadGenFormId": "…", "ads": [ … ] }
  }
}
```
Only the platforms you requested appear under `results`.

#### TikTok concept mapping
TikTok names some concepts differently from Meta (same DB column purpose):

| Meta | TikTok | DB column |
| ---- | ------ | --------- |
| Ad Set | Ad Group | `tiktok_adgroup_id` |
| Lead Form | Instant Form | `tiktok_leadgen_form_id` |

Targeting is translated in `src/platforms/tiktok/targeting.ts`: ISO alpha-2
countries → TikTok location ids (22 curated countries; unsupported ones error in
real mode), age min/max → TikTok age buckets, and gender → TikTok's gender field.

Docs: [TikTok Marketing API](https://business-api.tiktok.com/portal/docs)

#### Mock mode
With `META_MOCK_MODE=true` / `TIKTOK_MOCK_MODE=true` (both default) no real
platform calls are made — deterministic IDs are returned (`mock_*` for Meta,
`mock_tt_*` for TikTok) and rows are still written to Supabase. Flip a platform's
flag to `false` once its credentials are set.

#### Partial-failure policy
For a multi-platform spec, if any platform fails the orchestrator rolls back the
already-completed platform(s) best-effort and re-throws — a half-built
multi-platform campaign is never persisted (matches the Phase 2 rollback pattern).

#### Example · Meta only
```bash
curl -X POST http://localhost:8080/api/v1/campaigns \
  -H "X-API-Key: $AURUM_ADS_ENGINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AURUM_AI_LeadGen_Test_v1",
    "dailyBudget": 30000,
    "targeting": { "ageMin": 28, "ageMax": 55, "interests": ["Forex", "Gold", "Investment"], "countries": ["TH", "JP", "SG"] },
    "schedule": { "startTime": "2026-06-20T00:00:00+07:00" },
    "leadGenForm": {
      "headline": "ทดลอง AURUM AI ฟรี 7 วัน",
      "description": "รับบทวิเคราะห์ราคาทอง XAUUSD จาก AI",
      "privacyPolicyUrl": "https://aurumlive.com/privacy",
      "thankYouTitle": "ขอบคุณ!",
      "thankYouBody": "ทีม AURUM AI จะติดต่อกลับภายใน 1-2 ชั่วโมง",
      "thankYouButtonText": "เข้าใช้งานทันที",
      "thankYouButtonUrl": "https://aurumlive.com"
    },
    "ads": [{
      "name": "Ad1_Authority_v1",
      "imageUrl": "https://aurumlive.com/img/ad1.jpg",
      "primaryText": "AURUM AI ...",
      "headline": "AI วิเคราะห์ราคาทอง XAUUSD",
      "callToActionType": "LEARN_MORE"
    }]
  }'
```
`dailyBudget` is in the smallest currency unit (THB satang). Note the
`FINANCIAL_PRODUCTS_AND_SERVICES` special ad category is locked in on the
campaign and cannot be changed afterwards.

`targeting.countries` is an array of ISO 3166-1 alpha-2 codes (uppercase, e.g.
`["TH", "JP", "SG"]`) forwarded to Meta `targeting.geo_locations.countries`. It
is optional and defaults to `["TH"]` when omitted, so existing callers are
unaffected.

#### Example · Meta + TikTok (both)
Add `"platform": ["meta", "tiktok"]` to fan the same spec out to both platforms:
```bash
curl -X POST http://localhost:8080/api/v1/campaigns \
  -H "X-API-Key: $AURUM_ADS_ENGINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AURUM_AI_LeadGen_Multi_v1",
    "platform": ["meta", "tiktok"],
    "dailyBudget": 30000,
    "targeting": { "ageMin": 28, "ageMax": 55, "interests": ["Forex", "Gold"], "countries": ["TH", "SG"] },
    "schedule": { "startTime": "2026-06-20T00:00:00+07:00" },
    "leadGenForm": {
      "headline": "ทดลอง AURUM AI ฟรี 7 วัน",
      "description": "รับบทวิเคราะห์ราคาทอง XAUUSD จาก AI",
      "privacyPolicyUrl": "https://aurumlive.com/privacy",
      "thankYouTitle": "ขอบคุณ!",
      "thankYouBody": "ทีม AURUM AI จะติดต่อกลับ",
      "thankYouButtonText": "เข้าใช้งานทันที",
      "thankYouButtonUrl": "https://aurumlive.com"
    },
    "ads": [{
      "name": "Ad1_Authority_v1",
      "imageUrl": "https://aurumlive.com/img/ad1.jpg",
      "primaryText": "AURUM AI ...",
      "headline": "AI วิเคราะห์ราคาทอง XAUUSD",
      "callToActionType": "SIGN_UP"
    }]
  }'
```

### Environment variables
Meta vars are unchanged from Phase 2. TikTok adds:

```
TIKTOK_MOCK_MODE=true                 # skip real TikTok API calls (default)
TIKTOK_ADVERTISER_ID=…                # TikTok advertiser id
TIKTOK_ACCESS_TOKEN=…                 # long-lived OAuth Access-Token
TIKTOK_APP_ID=…                       # TikTok app id
TIKTOK_APP_SECRET=…                   # TikTok app secret
TIKTOK_PIXEL_ID=D8QGJRRC77U082M868CG  # pixel on aurumlive.com
TIKTOK_API_VERSION=v1.3
TIKTOK_API_BASE_URL=https://business-api.tiktok.com/open_api
```
See `.env.example` for the full list. Required TikTok scopes:
`ad_management`, `leads`, `audience_management`.

## Webhooks

Lead-ad callbacks are mounted at `/api/v1/webhooks/*`. Unlike the `/api/v1/*`
campaign routes, webhooks are **not** behind `X-API-Key` — they authenticate via
per-platform HMAC signatures instead. The raw request body is preserved
(`express.raw`) so signatures verify against the exact bytes the provider signed.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET  | `/api/v1/webhooks/meta-leads` | Meta verification handshake (echoes `hub.challenge`) |
| POST | `/api/v1/webhooks/meta-leads` | Meta lead receipt (verify → Graph fetch → persist → notify) |
| POST | `/api/v1/webhooks/tiktok-leads` | TikTok lead receipt (verify → normalize → persist → notify) |
| POST | `/api/v1/webhooks/test` | Inject a synthetic lead end-to-end (mock mode only) |

Production webhook URLs (Railway):
- `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/meta-leads`
- `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/tiktok-leads`

### Behavior contract
- Responds within the 5s provider timeout: persistence is awaited, notifications
  are fire-and-forget (`Promise.allSettled`, never blocking the 200).
- Returns **200** on success — and also on internal errors, so Meta/TikTok don't
  retry-storm. The only non-200 is **401** on a signature mismatch (and **403**
  on a failed Meta GET verification).
- **Idempotent**: the same `leadgen_id` / `lead_id` arriving twice returns the
  existing lead and fires no second notification. Enforced by a pre-check plus
  the partial unique index `idx_leads_platform_lead_id`.
- Meta lead-ads are stored with `source_platform = 'facebook'` (the `leads` CHECK
  has no `'meta'`); TikTok uses `'tiktok'`.

### Signature verification + token rotation
- **Meta** — header `X-Hub-Signature-256: sha256=<hmac_hex>`, HMAC-SHA256 of the
  raw body keyed by `META_APP_SECRET`. The GET handshake checks
  `META_WEBHOOK_VERIFY_TOKEN`. The Graph API lead fetch reuses
  `META_PAGE_ACCESS_TOKEN`.
- **TikTok** — header `X-Tt-Signature: <hmac_hex>`, HMAC-SHA256 of the raw body
  keyed by `TIKTOK_WEBHOOK_SECRET`.
- To rotate: generate a new secret (`openssl rand -hex 32`), update it in the
  provider dashboard, then update the Railway env var. Both checks are
  constant-time (`crypto.timingSafeEqual`).

### Mock mode (local testing)
With `WEBHOOK_MOCK_MODE=true` (default) signature checks are bypassed and the
`/test` endpoint is enabled. Inject a lead without any real subscription:

```bash
curl -X POST http://localhost:8080/api/v1/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "meta",
    "leadId": "test_lead_001",
    "adId": "meta_ad_1",
    "campaignId": "meta_camp_1",
    "email": "lead@example.com",
    "phone": "+66811111111",
    "name": "Test Lead"
  }'
```

Flip `WEBHOOK_MOCK_MODE=false` in production once secrets are set so signatures
are enforced.

### Notification channels
All optional and independent — each silently skips when its env vars are absent:

| Channel | Required env vars |
| ------- | ----------------- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` |
| Email (Resend) | `RESEND_API_KEY` (+ optional `RESEND_FROM_EMAIL`, `LEAD_NOTIFICATION_EMAIL`) |
| LINE OA | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ADMIN_USER_ID` |

Full step-by-step provider setup (Facebook App, TikTok Business Center, ngrok)
lives in `docs/PHASE1_WEBHOOK_SETUP.md`.

### Tests
```bash
npm test                 # unit + integration (mock mode)
npm run test:integration # integration only
```

### DB migrations
- `db/migrations/0002_phase2_meta_ids.sql` adds nullable columns for the Meta
  chain IDs (`meta_adset_id`, `meta_leadgen_form_id` on `ad_campaigns`;
  `meta_creative_id`, `meta_ad_id`, `image_hash` on `ad_creatives`).
- `db/migrations/0003_phase3_tiktok_ids.sql` adds the TikTok child IDs
  (`tiktok_adgroup_id`, `tiktok_leadgen_form_id` on `ad_campaigns`;
  `tiktok_creative_id`, `tiktok_ad_id` on `ad_creatives`) plus a GIN index on
  `ad_campaigns.platforms`. (`tiktok_campaign_id` already existed.)
- `db/migrations/0004_phase1_lead_dedup.sql` adds a partial unique index
  `idx_leads_platform_lead_id` on `(tags->>'source_lead_id', source_platform)`
  for webhook idempotency, plus `idx_leads_source_campaign` for attribution
  lookups. The webhook normalizer writes `tags` as a JSON **object**
  (`{ source_lead_id, source_platform, ad_id, form_id }`) so the unique index
  can key off it.

## Status history: Phase 0 (foundation skeleton)

## Phase plan
- [x] Phase 0: Repo skeleton + 8 Supabase tables + customer pixels
- [ ] Phase 1: Lead capture webhooks · /leads inbox (read-only)
- [ ] Phase 1.5: Unified reply (LINE + Meta + IG) + Media library
- [ ] Phase 1.7: Sales flow templates + scheduler
- [ ] Phase 2: TikTok Ads API + dashboard /ads tab
- [ ] Phase 3: Custom Audience + retargeting flow
- [ ] Phase 4: Meta Ads + cross-platform attribution
- [ ] Phase 5: LINE LAP + Google Ads + AI creative gen

## Deploy
Railway · auto-deploy on push to main
URL: TBD (สร้าง project ใหม่ใน Railway · connect repo · Por ทำ UI)

## Local dev
```bash
npm install
cp .env.example .env   # fill SUPABASE_SERVICE_ROLE_KEY
npm run dev            # tsx watch src/server.ts
curl localhost:3000/health
npm run typecheck
```

## Related repos
- Aurum-Admin: /ads + /leads tabs (Phase 1+)
- xauusd-dashboard: customer site · pixels installed
