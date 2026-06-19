import winston from 'winston';

const SENSITIVE_KEYS = [
  'access_token',
  'pageAccessToken',
  'page_access_token',
  'appsecret_proof',
  'app_secret',
  'appSecret',
  'authorization',
  'x-api-key',
  'apiKey',
];

const TOKEN_QS = /([?&](?:access_token|appsecret_proof)=)[^&\s]+/gi;

/**
 * Recursively redact secrets from anything we log. Handles objects, arrays,
 * and inlined query strings (Meta tokens are often passed as ?access_token=).
 */
export function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(TOKEN_QS, '$1***');
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => s.toLowerCase() === k.toLowerCase())) {
        out[k] = '***';
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info');

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'aurum-ads-engine' },
  transports: [new winston.transports.Console()],
});
