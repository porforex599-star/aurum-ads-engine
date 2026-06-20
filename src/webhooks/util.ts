// Phase 1 · PR-1 · Small shared helpers for webhook handlers.

/**
 * Normalize whatever Express handed us into the raw request Buffer.
 *
 * With the raw body parser (express.raw, wildcard type) mounted on the webhook
 * router, req.body is already a Buffer. We still guard against the empty-body
 * ({}) and string cases so signature verification + JSON parsing never crash.
 */
export function asBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    return Buffer.from(JSON.stringify(body));
  }
  return Buffer.from('');
}

/** Best-effort message extraction for logging unknown thrown values. */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
