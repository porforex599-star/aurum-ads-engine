/**
 * Typed application errors. Every error carries an HTTP-friendly status code,
 * a stable machine-readable `code`, and optional structured `details` so the
 * route layer can serialize a consistent JSON error envelope.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, opts: { statusCode?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = opts.statusCode ?? 500;
    this.code = opts.code ?? 'internal_error';
    this.details = opts.details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/**
 * Recursively redact secret-shaped values before they are logged or returned
 * to a client. A key is considered sensitive if its name matches
 * `/token|secret|key/i` (case-insensitive, also matches nested keys). Matching
 * values are replaced with the literal string `[REDACTED]`.
 */
const SECRET_KEY_RE = /token|secret|key/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redactSecrets(v);
    }
    return out;
  }
  return value;
}

export interface MetaApiErrorOptions {
  /** Which orchestration step the failing call belongs to. */
  stepKey?: string;
  /** HTTP status returned by Graph (or 502 when unknown). */
  httpStatus?: number;
  /** Alias for httpStatus, kept for backward compatibility. */
  statusCode?: number;
  fbtraceId?: string;
  /** Meta `error.code`. */
  code?: number;
  /** Alias for code, kept for backward compatibility. */
  metaCode?: number;
  /** Meta `error.error_subcode`. */
  subcode?: number;
  /** Alias for subcode, kept for backward compatibility. */
  metaSubcode?: number;
  type?: string;
  /** Meta `error.error_user_title`. */
  userTitle?: string;
  /** Meta `error.error_user_msg` — usually the human-readable real cause. */
  userMsg?: string;
  /** Alias for userMsg, kept for backward compatibility. */
  userMessage?: string;
  /** Meta `error.error_data`. */
  errorData?: unknown;
  /** Graph request path, e.g. /v23.0/act_xxx/campaigns. */
  requestPath?: string;
  /** Request body/params — secret-shaped keys are redacted in the constructor. */
  requestPayload?: unknown;
  /** The full `response.error` object verbatim. */
  rawError?: unknown;
  /** Legacy generic details bag (mirrors rawError when rawError is absent). */
  details?: unknown;
}

/**
 * Raised when the Meta Graph API returns an error response.
 *
 * Preserves the full Meta error envelope (`error_user_msg`, `error_subcode`,
 * `fbtrace_id`, `error_data`), the request path and the (redacted) request
 * payload so failures can be diagnosed without re-reading server logs.
 */
export class MetaApiError extends AppError {
  public readonly stepKey: string;
  public readonly httpStatus: number;
  public readonly fbtraceId?: string;
  // Meta's numeric error code / subcode. Named `metaCode`/`metaSubcode` to avoid
  // clashing with AppError's string `code` (the machine-readable error slug).
  public readonly metaCode?: number;
  public readonly metaSubcode?: number;
  public readonly type?: string;
  public readonly userTitle?: string;
  public readonly userMsg?: string;
  public readonly errorData?: unknown;
  public readonly requestPath: string;
  public readonly requestPayload?: unknown;
  public readonly rawError: unknown;

  // Backward-compatible alias (Phase 2 call sites + tests read this).
  public readonly userMessage?: string;

  constructor(message: string, opts: MetaApiErrorOptions = {}) {
    const httpStatus = opts.httpStatus ?? opts.statusCode ?? 502;
    const rawError = opts.rawError ?? opts.details;
    super(message, { statusCode: httpStatus, code: 'meta_api_error', details: rawError });

    this.stepKey = opts.stepKey ?? 'unknown';
    this.httpStatus = httpStatus;
    this.fbtraceId = opts.fbtraceId;
    this.metaCode = opts.code ?? opts.metaCode;
    this.metaSubcode = opts.subcode ?? opts.metaSubcode;
    this.type = opts.type;
    this.userTitle = opts.userTitle;
    this.userMsg = opts.userMsg ?? opts.userMessage;
    this.errorData = opts.errorData;
    this.requestPath = opts.requestPath ?? '';
    this.requestPayload =
      opts.requestPayload !== undefined ? redactSecrets(opts.requestPayload) : undefined;
    this.rawError = rawError;

    this.userMessage = this.userMsg;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.userMsg ? { userMessage: this.userMsg } : {}),
      ...(this.fbtraceId ? { fbtraceId: this.fbtraceId } : {}),
    };
  }
}

/**
 * Raised when the TikTok Marketing API returns an error response.
 *
 * TikTok signals failure with a non-zero `code` in an HTTP-200 body
 * (`{ code, message, request_id, data }`), so the client maps that envelope
 * into this error rather than relying on the HTTP status alone.
 */
export class TiktokApiError extends AppError {
  public readonly tiktokCode?: number;
  public readonly requestId?: string;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      tiktokCode?: number;
      requestId?: string;
      details?: unknown;
    } = {}
  ) {
    super(message, { statusCode: opts.statusCode ?? 502, code: 'tiktok_api_error', details: opts.details });
    this.tiktokCode = opts.tiktokCode;
    this.requestId = opts.requestId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.tiktokCode !== undefined ? { tiktokCode: this.tiktokCode } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
    };
  }
}

/** Raised when orchestration fails (after best-effort rollback). */
export class OrchestrationError extends AppError {
  /** How many already-completed platforms were rolled back. */
  public readonly rolledBack?: number;
  /** The upstream Meta error, when the failure originated from Graph. */
  public readonly metaError?: MetaApiError;

  constructor(
    message: string,
    details?: { rolledBack?: number; metaError?: MetaApiError } | unknown
  ) {
    super(message, { statusCode: 500, code: 'orchestration_failed', details });
    if (details && typeof details === 'object') {
      const d = details as { rolledBack?: number; metaError?: MetaApiError };
      this.rolledBack = d.rolledBack;
      this.metaError = d.metaError instanceof MetaApiError ? d.metaError : undefined;
    }
  }
}
