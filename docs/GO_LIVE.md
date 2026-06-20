# 🚀 AURUM Ads · Go-Live Playbook

**Goal:** From "Phase 1 merged · mock mode" → first real Meta or TikTok lead in
the `/leads` table, with notifications firing.

This playbook is the source of truth from here to first real lead. Update it
inline as steps complete so future-Por (and future-Claude) can pick up where you
left off.

**Status when this playbook starts:**

- ✅ `aurum-ads-engine` deployed, 88 tests + companion PR fixes green
- ✅ `/leads` page live on `aurum-admin-eight.vercel.app`
- ✅ Telegram + Email + LINE OA notifications wired
- ⏳ Meta account unbanned (external — Meta Verified manual review)
- ⏳ TikTok Business Center registered + Marketing API approved (external — 3-7 day BV)
- ⏳ Service-role keys rotated (run separate playbook first)

---

## Phase A · Pre-flight (do these BEFORE any platform is unblocked)

### A1. Run service-role rotation playbook

Sequential rotation of both `aurum-customers` + `aurum-crm` keys. Must complete
before A2.

### A2. Merge companion PR (aurum-ads-engine 0.4.1)

Fixes `/test` endpoint bugs (`display_name` + `source_campaign_id`). Without
this, real webhooks would also miss campaign attribution.

### A3. Verify `/leads` end-to-end one more time

After the companion PR is on production Railway, run this curl from Windows cmd:

```cmd
curl --ssl-no-revoke -X POST ^
  "https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/test" ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: %AURUM_ADS_ENGINE_API_KEY%" ^
  -d "{\"platform\":\"meta\",\"display_name\":\"GoLive Smoke\",\"email\":\"smoke@aurum.test\",\"phone\":\"+66800000001\",\"platformCampaignId\":\"mock_camp_d5642263b72e9bd5\"}"
```

Expect:

- `200 OK` with `lead_id` + populated `display_name` + populated `source_campaign_id`
- Telegram notification arrives in chat `7741305488`
- Email arrives at `porforex599@gmail.com`
- `/leads` page shows a row with name "GoLive Smoke" + campaign chip "AURUM_Wk26_2026-06-20"

If anything is red → fix before going live.

### A4. LINE OA channel access token verified

- Open LINE Developers Console → `@aurumai` channel → Messaging API → Channel access token
- Confirm the token in `aurum-ads-engine` Railway env (`LINE_CHANNEL_ACCESS_TOKEN`) matches
- Send a test message from the console to your own user ID → confirm the OA can push

---

## Phase B · Meta Lead Ads Setup (when Meta unbans)

### B1. Confirm account state

- `business.facebook.com` → Business Settings → Accounts → confirm Pages + Ad Accounts no longer restricted
- Meta Verified support case status = "Resolved"
- `act_23845968344460231` is the production Ad Account (already in env)

### B2. Create Lead Form (in Meta Ads Manager)

Don't reuse old forms from any prior account. Build fresh:

- Ads Manager → Library → Forms → Create
- Form type: **More volume** (vs Higher intent — for cold acquisition)
- Required fields (must exist for AURUM mapping):
  - Full name
  - Email
  - Phone number (+66 default)
- Optional: 1 custom question — e.g. "Trading experience: Beginner / 1-3 yrs / 3+ yrs"
- Privacy policy: link to `aurumlive.com/privacy` (create if missing)
- Thank-you screen → "Open website" → URL
  `https://aurumlive.com/welcome?utm_source=meta&utm_campaign={{campaign_name}}`

### B3. Subscribe app to Page leadgen webhook

1. `developers.facebook.com` → your AURUM app → Settings → Webhooks
2. Add subscription → Object: **Page** → Subscribe to `leadgen`
3. Callback URL: `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/meta-leads`
4. Verify Token: paste `META_WEBHOOK_VERIFY_TOKEN` from Railway env (the value `baeb19eb...`)
5. Click "Verify and Save" → Meta will GET your endpoint with `hub.challenge` →
   your endpoint must echo it back. (PR-1 already implements this.) If verification fails:
   - Check Railway logs for the GET request
   - Confirm `META_WEBHOOK_VERIFY_TOKEN` env matches verbatim (no trailing newline)
6. Page subscription → select the AURUM Page → "Subscribe"

### B4. Get Page Access Token + Subscribe Page

1. Graph API Explorer → select your app → select your Page → permissions
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`
2. Generate token → Extend to never-expire (Tools → Access Token Tool → Extend)
3. POST `/{page-id}/subscribed_apps?subscribed_fields=leadgen&access_token=<page_token>`
4. Confirm: GET `/{page-id}/subscribed_apps?access_token=<page_token>` returns your app

### B5. Update Railway env vars with real values

Replace placeholders:

- `META_PAGE_ID` = AURUM Page ID
- `META_PAGE_ACCESS_TOKEN` = extended page token from B4
- `META_APP_SECRET` = AURUM app secret from developers.facebook.com → Settings → Basic
- `META_AD_ACCOUNT_ID` = `act_23845968344460231` (already set)
- `META_BUSINESS_ID` = `1320403876304227` (already set)

### B6. Flip mock mode

- Railway → `aurum-ads-engine` → Variables → set `META_MOCK_MODE=false`
- Service restarts automatically (~30s)
- Confirm via Railway logs that the boot banner reads `Meta: LIVE` (or however the engine logs mode)

### B7. Smoke test with Meta's tooling

1. Ads Manager → Forms Library → your test form → "Preview"
2. Open the preview link on your phone → submit a test lead with `Por Test Meta` + `meta-smoke@aurum.test`
3. Within ~10s:
   - Railway logs show `POST /api/v1/webhooks/meta-leads` 200 OK
   - Telegram + Email arrive
   - `/leads` row visible with `platform=meta` + name populated
4. If `source_campaign_id` is null but you expected attribution → your test form
   isn't attached to a real campaign yet (that's expected for preview
   submissions). Will resolve on real campaign launch.

---

## Phase C · TikTok Lead Ads Setup (when TikTok approves)

### C1. Register TikTok Business Center

- `business.tiktok.com` → Sign up → use a business email (consider
  `business@aurumlive.com` or a Gmail alias dedicated to TikTok)
- Verify business: upload Thai company registration (กรมพัฒนาธุรกิจการค้า DBD
  certificate) + Por's national ID
- Wait for verification: 3-7 business days

### C2. Create TikTok Ads Account inside BC

- Business Center → Ad Accounts → Create → Thailand, THB, AURUM Co.
- Add Por as Admin user
- Grant the TikTok For Business app the ad account access

### C3. Apply for Marketing API access

- Business Center → Apps → Developer → Create App → "AURUM Ads Engine"
- Request scopes: `Lead Management`, `Campaign Read`, `Ad Read`
- Submit for review — 3-7 business days (some accounts get instant approval, most don't)

### C4. Create Lead Form (TikTok Lead Gen)

- Ads Manager → Library → Instant Forms → Create
- Form template: **High intent** (TikTok's TOFU-MOFU bridge — more tap-throughs than Meta's More-volume)
- Required fields: Name, Email, Phone (+66)
- Privacy policy → `aurumlive.com/privacy`
- Thank-you screen with the same UTM-tagged URL as Meta

### C5. Subscribe app to lead webhooks

1. TikTok Developer Portal → your app → Event Subscriptions
2. Subscribe to `leadgen` event
3. Callback URL: `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/tiktok-leads`
4. Secret: paste `TIKTOK_WEBHOOK_SECRET` from Railway env (`3308b172...`)
5. Save → TikTok validates the endpoint (HMAC challenge — PR-1 implements)

### C6. Update Railway env vars

- `TIKTOK_APP_ID` = from developer portal
- `TIKTOK_APP_SECRET` = from developer portal
- `TIKTOK_ACCESS_TOKEN` = long-lived token from OAuth flow
- `TIKTOK_ADVERTISER_ID` = your TikTok ad account ID
- `TIKTOK_PIXEL_ID` = `D8QGJRRC77U082M868CG` (already set)

### C7. Flip mock mode

- Railway → set `TIKTOK_MOCK_MODE=false`
- Service restarts

### C8. Smoke test

- TikTok Ads Manager → Form → Preview on phone → submit
- Verify the same flow as Meta B7

---

## Phase D · Flip global mock-mode + first real campaign

### D1. Disable global mock mode

- Railway → set `WEBHOOK_MOCK_MODE=false` (this is the master flag — keep the
  `/test` endpoint working but disable simulated background traffic if PR-1 has any)
- Service restarts

### D2. Launch first real campaign via `/ads`

1. Open `aurum-admin-eight.vercel.app/ads`
2. Click "Create Campaign"
3. Fill the form:
   - Name: `AURUM_Wk26_LeadGen_LIVE_2026-06-21`
   - Platform: ☑ Meta ☐ TikTok (start single-platform — easier to debug)
   - Objective: Lead Generation
   - Daily budget: THB 500 (= 50,000 satang — keep test budget tiny)
   - Schedule: today → today + 3 days
   - Countries: Thailand
   - Age: 25-55, all genders
   - Interests: (use the curated list in the modal — gold trading, investing, finance)
   - Creative: 1 image, copy in Thai matching the AURUM tone, CTA = "Sign Up"
   - Lead form: select the form from B2
4. Submit → modal shows engine response
5. `ad_campaigns` table gets a real row with `meta_campaign_id = <real Meta campaign ID>`

### D3. First real lead

Wait for organic traffic (could be hours) or:

- Have someone on your team fill the lead form via the published ad (preview link
  won't fire the webhook on real campaigns — only published creatives do)
- Watch Railway logs for `POST /api/v1/webhooks/meta-leads` 200 OK
- Telegram notification arrives
- `/leads` page shows the new lead with:
  - `platform = meta`
  - `display_name` populated
  - `source_campaign_id` resolved to the new campaign row
  - `status = new`
- Click the row → detail modal shows campaign link → click → opens `/ads`
  filtered to that campaign with lead count = 1

🎉 **GOAL ACHIEVED.** Real ad → real lead → notification → admin view.

---

## Phase E · Sustained operations (first 7 days)

### E1. Daily morning check (5 min)

- `/leads` → count of leads created in last 24h (KPI card)
- `/ads` → campaign detail → cost per lead (CPL) = spend / lead count
- Target CPL: define your own (e.g. ≤ THB 150 for cold acquisition)

### E2. Status pipeline discipline

For every new lead:

1. Within 2 hours: change `new` → `engaged` after first contact (DM/LINE/phone)
2. Within 24 hours: `engaged` → `qualified` if budget+intent confirmed
3. After payment: `qualified` → `customer` (auto-stamps `converted_to_customer` + `converted_at`)
4. If go-dark > 7 days: `engaged` → `lapsed`

### E3. Adjust campaign weights

- After 50 leads or 7 days (whichever first), compute CPL per campaign
- Pause campaigns with CPL > 1.5× target
- Increase budget on top 2 performers by 30% step

### E4. Watch error logs

- Railway `aurum-ads-engine` logs: filter to `level=error` or HTTP 5xx
- Supabase `leads` table: any rows with `tags.platform_campaign_id_unresolved` set → debug attribution
- Notification failures: if Telegram or Email silently drops, the lead is still
  in the DB but Por won't be alerted in real-time. Add a daily 8am cron task:
  query "leads created in last 24h" and Telegram a digest.

---

## Phase F · Phase 2 prerequisites (audience builder + drip)

When Phase E is stable (~30 leads/day, CPL under target), Phase 2 unlocks:

- Audience segments (high-intent vs cold) computed from `tags` and lead history
- Drip campaigns: 3-touch sequence via LINE OA + Email (Day 0 / Day 1 / Day 3)
- Retargeting: hash + upload `lapsed` leads back to Meta/TikTok Custom Audiences

Phase 2 is its own roadmap — start scoping when D and E are smooth.

---

## Rollback procedures

### If a Meta webhook misfires (signature fails, schema unexpected)

- Set `META_MOCK_MODE=true` on Railway → all `/meta-leads` requests treated as
  untrusted → log + 200 but don't persist
- Meta won't retry past ~3 retries, so set this fast if you see corruption
- Debug from logs, fix, redeploy, flip back to `false`

### If notification spam fires

- Telegram or Email loops can fire if a campaign goes viral unexpectedly
- Emergency: set `NOTIFICATIONS_ENABLED=false` on Railway (if PR-1 supports it;
  otherwise hot-patch by setting `TELEGRAM_BOT_TOKEN=disabled`)
- Leads still persist to DB — just no real-time push

### If lead PII exposure suspected

- Immediately revoke service_role keys (rotation playbook)
- Disable Vercel `aurum-admin-eight` public access (Vercel → Project → Settings → Password Protection)
- Audit `admin_audit_log` for unusual reads
- Contact PDPA-relevant authorities if confirmed breach (Thailand Personal Data Protection Committee)

---

## Open questions for Por (decide before D2)

1. Daily budget for first real campaign? Recommend THB 500-1,000/day for first 3 days.
2. Lead form custom question? Decide which qualifier helps you most — trading
   experience, capital range, or something else.
3. Privacy policy URL — confirm `aurumlive.com/privacy` exists and is current. If
   not, draft one before B2.
4. Backup notification channel — if Telegram is down, do you want SMS fallback via
   Movider for critical leads? (Optional Phase E enhancement.)

---

## Checklist · the literal sequence

```
[ ] A1  Rotate aurum-customers service_role key
[ ] A1  Rotate aurum-crm service_role key
[ ] A2  Merge companion PR (aurum-ads-engine 0.4.1)
[ ] A3  Smoke test /test endpoint → green
[ ] A4  Verify LINE OA channel token

⏸  WAIT for Meta unban  ⏸

[ ] B1  Confirm Meta account state
[ ] B2  Create Meta Lead Form
[ ] B3  Subscribe app to Page leadgen webhook
[ ] B4  Get & subscribe Page Access Token
[ ] B5  Update Railway Meta env vars
[ ] B6  Flip META_MOCK_MODE=false
[ ] B7  Smoke test from Form Preview

⏸  WAIT for TikTok BC approval + MAPI approval  ⏸

[ ] C1-C8  TikTok setup mirror of B1-B7

[ ] D1  Set WEBHOOK_MOCK_MODE=false
[ ] D2  Launch first real campaign via /ads
[ ] D3  Receive first real lead → goal reached

[ ] E1-E4  Sustained ops for 7 days
[ ] F      Scope Phase 2
```
