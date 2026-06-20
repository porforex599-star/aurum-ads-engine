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

/** Raised when the Meta Graph API returns an error response. */
export class MetaApiError extends AppError {
  public readonly metaCode?: number;
  public readonly metaSubcode?: number;
  public readonly fbtraceId?: string;
  public readonly userMessage?: string;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      metaCode?: number;
      metaSubcode?: number;
      fbtraceId?: string;
      userMessage?: string;
      details?: unknown;
    } = {}
  ) {
    super(message, { statusCode: opts.statusCode ?? 502, code: 'meta_api_error', details: opts.details });
    this.metaCode = opts.metaCode;
    this.metaSubcode = opts.metaSubcode;
    this.fbtraceId = opts.fbtraceId;
    this.userMessage = opts.userMessage;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.userMessage ? { userMessage: this.userMessage } : {}),
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
  constructor(message: string, details?: unknown) {
    super(message, { statusCode: 500, code: 'orchestration_failed', details });
  }
}
