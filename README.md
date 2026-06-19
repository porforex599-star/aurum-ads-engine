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

## Status: Phase 2 · PR-1 (Meta Marketing API · Lead Gen)

### Phase 2 endpoints
All `/api/v1/*` routes require an `X-API-Key` header matching `AURUM_ADS_ENGINE_API_KEY`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/v1/campaigns` | Create the full Meta lead-gen chain (campaign → ad set → lead form → creative → ad) and persist to Supabase |
| GET | `/api/v1/campaigns` | List recent campaigns |
| GET | `/api/v1/campaigns/:id` | Single campaign with its creatives |
| GET | `/api/v1/campaigns/:id/status` | Live Meta delivery status (live/paused/error) |

`/health` now reports `phase: 2` and Meta mock-mode state.

#### Mock mode
With `META_MOCK_MODE=true` (default) no real Meta calls are made — deterministic
`mock_*` IDs are returned and rows are still written to Supabase. Flip to `false`
once `META_*` credentials are set.

#### Example
```bash
curl -X POST http://localhost:8080/api/v1/campaigns \
  -H "X-API-Key: $AURUM_ADS_ENGINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AURUM_AI_LeadGen_Test_v1",
    "dailyBudget": 30000,
    "targeting": { "ageMin": 28, "ageMax": 55, "interests": ["Forex", "Gold", "Investment"] },
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

### Tests
```bash
npm test                 # unit + integration (mock mode)
npm run test:integration # integration only
```

### DB migration
`db/migrations/0002_phase2_meta_ids.sql` adds nullable columns to persist the
Meta chain IDs (`meta_adset_id`, `meta_leadgen_form_id` on `ad_campaigns`;
`meta_creative_id`, `meta_ad_id`, `image_hash` on `ad_creatives`).

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
