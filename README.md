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

## Status: Phase 0 (foundation skeleton)

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
