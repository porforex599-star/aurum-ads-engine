import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomBytes } from 'crypto';
import { config } from '../../config';
import { logger, sanitize } from '../../lib/logger';
import { TiktokApiError } from '../../lib/errors';
import { TiktokEnvelope } from './types';

const MAX_RETRIES = 4;
const RETRY_BASE_MS = 500;

export function randomId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Thin wrapper around the TikTok Marketing API (business-api.tiktok.com).
 *
 * Responsibilities:
 *  - inject base URL + version + `Access-Token` auth header
 *  - unwrap TikTok's `{ code, message, data, request_id }` envelope and map a
 *    non-zero `code` (returned even on HTTP 200) into TiktokApiError
 *  - retry on 429 / transient 5xx with exponential backoff
 *  - log every request/response with the access token redacted
 *  - short-circuit to deterministic fake responses when mockMode is on
 */
export class TiktokClient {
  private readonly http: AxiosInstance;
  public readonly mockMode: boolean;
  public readonly apiVersion: string;
  private readonly advertiserId?: string;
  private readonly accessToken?: string;

  constructor(opts = config.tiktok) {
    this.mockMode = opts.mockMode;
    this.apiVersion = opts.apiVersion;
    this.advertiserId = opts.advertiserId;
    this.accessToken = opts.accessToken;
    this.http = axios.create({
      baseURL: `${opts.apiBaseUrl}/${opts.apiVersion}`,
      timeout: 30_000,
    });
  }

  /** Resolved advertiser id, throwing if missing in real mode. */
  get resolvedAdvertiserId(): string {
    if (!this.advertiserId) {
      throw new TiktokApiError('TIKTOK_ADVERTISER_ID is not configured', { statusCode: 500 });
    }
    return this.advertiserId;
  }

  /**
   * Advertiser id for the current mode: in mock mode falls back to a stable
   * placeholder so the orchestrator can run without real credentials; in real
   * mode this throws when the id is missing.
   */
  resolvedAdvertiserIdOrMock(): string {
    if (this.mockMode) return this.advertiserId || 'mock_advertiser';
    return this.resolvedAdvertiserId;
  }

  async post<T>(path: string, body: Record<string, unknown>, mock?: () => T): Promise<T> {
    if (this.mockMode) {
      const res = mock ? mock() : ({ id: `mock_tt_${randomId()}` } as unknown as T);
      logger.info('tiktok.mock.post', { path, body: sanitize(body), response: sanitize(res) });
      return res;
    }
    return this.request<T>('post', path, body);
  }

  async get<T>(path: string, params: Record<string, unknown> = {}, mock?: () => T): Promise<T> {
    if (this.mockMode) {
      const res = mock ? mock() : ({ id: `mock_tt_${randomId()}` } as unknown as T);
      logger.info('tiktok.mock.get', { path, params: sanitize(params), response: sanitize(res) });
      return res;
    }
    return this.request<T>('get', path, undefined, params);
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.accessToken) {
      throw new TiktokApiError('TIKTOK_ACCESS_TOKEN is not configured', { statusCode: 500 });
    }
    const headers = { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' };

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        logger.info('tiktok.request', {
          method,
          path,
          // Never log the Access-Token header value.
          headers: sanitize({ ...headers, 'Access-Token': '***' }),
          params: sanitize(params),
          body: sanitize(body),
        });
        const res =
          method === 'get'
            ? await this.http.get<TiktokEnvelope<T>>(path, { headers, params })
            : await this.http.post<TiktokEnvelope<T>>(path, body, { headers });
        logger.info('tiktok.response', { method, path, data: sanitize(res.data) });
        return this.unwrap<T>(res.data, path);
      } catch (err) {
        if (err instanceof TiktokApiError) throw err;
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (retryable && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * 2 ** attempt;
          attempt += 1;
          logger.warn('tiktok.retry', { path, status, attempt, delayMs: delay });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw this.normalizeError(axiosErr, path);
      }
    }
  }

  /** Unwrap TikTok's envelope, raising on a non-zero application code. */
  private unwrap<T>(envelope: TiktokEnvelope<T>, path: string): T {
    if (envelope.code !== 0) {
      logger.error('tiktok.error', {
        path,
        code: envelope.code,
        message: envelope.message,
        requestId: envelope.request_id,
      });
      throw new TiktokApiError(envelope.message || 'TikTok API request failed', {
        statusCode: 502,
        tiktokCode: envelope.code,
        requestId: envelope.request_id,
        details: envelope,
      });
    }
    return envelope.data;
  }

  private normalizeError(err: AxiosError, path: string): TiktokApiError {
    const message = err.message || 'TikTok API request failed';
    logger.error('tiktok.error', { path, status: err.response?.status, message });
    return new TiktokApiError(message, {
      statusCode: err.response?.status ?? 502,
      details: err.response?.data,
    });
  }
}

export const tiktokClient = new TiktokClient();
