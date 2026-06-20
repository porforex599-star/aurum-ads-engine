# Phase 1 · Lead Capture Webhook Setup

How to wire Meta (Facebook Lead Ads) and TikTok (Lead Generation) lead webhooks
into `aurum-ads-engine`, test them locally, and flip to production.

Production endpoints:

- Meta: `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/meta-leads`
- TikTok: `https://aurum-ads-engine-production.up.railway.app/api/v1/webhooks/tiktok-leads`

---

## 0. Environment variables (Railway)

| Var | Purpose |
| --- | ------- |
| `WEBHOOK_MOCK_MODE` | `true` bypasses signature checks + enables `/test`. Set `false` in prod. |
| `META_WEBHOOK_VERIFY_TOKEN` | Random string for the Meta GET handshake. `openssl rand -hex 32` |
| `META_APP_SECRET` | Already set (Phase 2). Used for the `X-Hub-Signature-256` HMAC. |
| `META_PAGE_ACCESS_TOKEN` | Already set (Phase 2). Used for the Graph API lead fetch. |
| `TIKTOK_WEBHOOK_SECRET` | Random string for the `X-Tt-Signature` HMAC. `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Optional Telegram alerts. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `LEAD_NOTIFICATION_EMAIL` | Optional email alerts. |
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ADMIN_USER_ID` | Optional LINE OA push. |

Generate the two secrets:

```bash
openssl rand -hex 32   # META_WEBHOOK_VERIFY_TOKEN
openssl rand -hex 32   # TIKTOK_WEBHOOK_SECRET
```

---

## 1. Meta — Facebook App → Webhooks

1. https://developers.facebook.com → your app → **Webhooks**.
2. Add subscription for the **Page** object.
3. **Callback URL**: the Meta production endpoint above.
4. **Verify Token**: the exact value of `META_WEBHOOK_VERIFY_TOKEN`.
5. Click **Verify and Save**. Meta sends a `GET` with
   `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`; the engine echoes the
   challenge when the token matches (otherwise `403`).
6. Subscribe to the **`leadgen`** field.
7. Ensure the Page is connected to the app and the `META_PAGE_ACCESS_TOKEN` has
   the `leads_retrieval` permission (required for the Graph API lead fetch).

Meta only delivers a `leadgen_id`; the engine fetches the full lead from
`GET graph.facebook.com/<version>/{leadgen_id}` using `META_PAGE_ACCESS_TOKEN`.
If the token is missing/expired the engine logs the `leadgen_id` (for manual
retrieval) and still returns `200`.

---

## 2. TikTok — Business Center → Webhooks

1. https://business.tiktok.com → **Business Center** → your app → **Webhooks**.
2. **Callback URL**: the TikTok production endpoint above.
3. Subscribe to the **Lead Generation** (`LEAD_FORM_SUBMIT`) event.
4. Set the signing secret to match `TIKTOK_WEBHOOK_SECRET`.

TikTok includes the full lead (`data.field_data`) inline — no second API call.
There is no GET handshake; the subscription is configured entirely in Business
Center.

---

## 3. Local testing

### Mock mode (no provider, no signatures)

With `WEBHOOK_MOCK_MODE=true`:

```bash
npm run dev   # tsx watch src/server.ts (port 8080)

curl -X POST http://localhost:8080/api/v1/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{"platform":"tiktok","leadId":"loc_1","campaignId":"c1","email":"a@b.com","name":"Local Test"}'
```

Check `/health` shows `version: 0.4.0` and the `webhooks` section.

### Realistic payloads with ngrok

```bash
ngrok http 8080
# Use the https ngrok URL as the Callback URL in the provider dashboard.
```

To exercise signature verification locally, set `WEBHOOK_MOCK_MODE=false` and
sign the raw body yourself:

```bash
BODY='{"object":"page","entry":[{"id":"P","changes":[{"field":"leadgen","value":{"leadgen_id":"L1","ad_id":"A1","form_id":"F1"}}]}]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | awk '{print $2}')"
curl -X POST http://localhost:8080/api/v1/webhooks/meta-leads \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
```

(For Meta this still needs a reachable Graph API / valid access token to fetch
the lead; in mock mode use `/test` instead.)

TikTok signature (no `sha256=` prefix):

```bash
BODY='{"event_type":"LEAD_FORM_SUBMIT","data":{"lead_id":"L1","campaign_id":"c1","field_data":[{"field_name":"email","value":"a@b.com"}]}}'
SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TIKTOK_WEBHOOK_SECRET" | awk '{print $2}')"
curl -X POST http://localhost:8080/api/v1/webhooks/tiktok-leads \
  -H "Content-Type: application/json" -H "X-Tt-Signature: $SIG" -d "$BODY"
```

---

## 4. Go-live checklist

- [ ] `0004_phase1_lead_dedup.sql` applied to `aurum-databot`.
- [ ] Secrets set in Railway; `WEBHOOK_MOCK_MODE=false`.
- [ ] Meta verify handshake green; `leadgen` field subscribed.
- [ ] TikTok `LEAD_FORM_SUBMIT` subscribed with the matching secret.
- [ ] Submit a real test lead; confirm a row in `public.leads` and (if
      configured) Telegram/email/LINE alerts.
- [ ] Attribution: `source_campaign_id` / `source_creative_id` populated when the
      ad was created through the AURUM dashboard (null otherwise — still stored).
