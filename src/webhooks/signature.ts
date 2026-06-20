// Phase 1 · PR-1 · HMAC SHA256 signature verification for inbound webhooks.
//
// Both helpers are constant-time: they compare the full computed digest against
// the supplied signature with crypto.timingSafeEqual so an attacker cannot
// learn the secret byte-by-byte from response timing.

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Meta's `X-Hub-Signature-256: sha256=<hmac_hex>` header against the
 * raw request body using META_APP_SECRET.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signature: string | undefined,
  appSecret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;
  if (!appSecret) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify TikTok's `X-Tt-Signature: <hmac_hex>` header (no scheme prefix)
 * against the raw request body using TIKTOK_WEBHOOK_SECRET.
 */
export function verifyTiktokSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
