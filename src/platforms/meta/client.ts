import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomBytes } from 'crypto';
import FormData from 'form-data';
import { config } from '../../config';
import { logger, sanitize } from '../../lib/logger';
import { MetaApiError } from '../../lib/errors';

const MAX_RETRIES = 4;
const RETRY_BASE_MS = 500;

export function randomId(): string {
  return randomBytes(8).toString('hex');
}

interface MetaErrorBody {
  error?: {
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
  };
}

/**
 * Thin wrapper around the Meta Graph (Marketing) API.
 *
 * Responsibilities:
 *  - inject base URL + version + access token
 *  - normalize Meta's idiosyncratic error envelope into MetaApiError
 *  - retry on 429 / transient 5xx with exponential backoff
 *  - log every request/response with tokens redacted
 *  - short-circuit to deterministic fake responses when mockMode is on
 */
export class MetaClient {
  private readonly http: AxiosInstance;
  public readonly mockMode: boolean;
  public readonly apiVersion: string;
  public readonly adAccountId?: string;
  public readonly pageId?: string;
  private readonly accessToken?: string;

  constructor(opts = config.meta) {
    this.mockMode = opts.mockMode;
    this.apiVersion = opts.apiVersion;
    this.adAccountId = opts.adAccountId;
    this.pageId = opts.pageId;
    this.accessToken = opts.pageAccessToken;
    this.http = axios.create({
      baseURL: `${opts.apiBaseUrl}/${opts.apiVersion}`,
      timeout: 30_000,
    });
  }

  /** Resolved `act_<id>` ad account path segment, throwing if missing in real mode. */
  get adAccountPath(): string {
    if (!this.adAccountId) {
      throw new MetaApiError('META_AD_ACCOUNT_ID is not configured', { statusCode: 500 });
    }
    return this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
  }

  get resolvedPageId(): string {
    if (!this.pageId) {
      throw new MetaApiError('META_PAGE_ID is not configured', { statusCode: 500 });
    }
    return this.pageId;
  }

  async post<T>(path: string, body: Record<string, unknown>, mock?: () => T): Promise<T> {
    if (this.mockMode) {
      const res = mock ? mock() : ({ id: `mock_${randomId()}` } as unknown as T);
      logger.info('meta.mock.post', { path, body: sanitize(body), response: sanitize(res) });
      return res;
    }
    return this.request<T>('post', path, body);
  }

  async get<T>(path: string, params: Record<string, unknown> = {}, mock?: () => T): Promise<T> {
    if (this.mockMode) {
      const res = mock ? mock() : ({ id: `mock_${randomId()}` } as unknown as T);
      logger.info('meta.mock.get', { path, params: sanitize(params), response: sanitize(res) });
      return res;
    }
    return this.request<T>('get', path, undefined, params);
  }

  /** Delete a node by id (best-effort, used for orchestration rollback). */
  async del(path: string): Promise<void> {
    if (this.mockMode) {
      logger.info('meta.mock.delete', { path });
      return;
    }
    if (!this.accessToken) {
      throw new MetaApiError('META_PAGE_ACCESS_TOKEN is not configured', { statusCode: 500 });
    }
    await this.http.delete(path, { params: { access_token: this.accessToken } });
  }

  /** Upload an image to the ad account by public URL; returns its content hash. */
  async uploadImageFromUrl(imageUrl: string): Promise<{ hash: string }> {
    if (this.mockMode) {
      const res = { hash: `mock_img_${randomId()}` };
      logger.info('meta.mock.uploadImage', { imageUrl, response: res });
      return res;
    }
    const data = await this.request<{ images: Record<string, { hash: string }> }>(
      'post',
      `/${this.adAccountPath}/adimages`,
      { url: imageUrl }
    );
    const first = Object.values(data.images ?? {})[0];
    if (!first?.hash) {
      throw new MetaApiError('Image upload returned no hash', { details: data });
    }
    return { hash: first.hash };
  }

  /** Upload an image from a local file via multipart (deferred path, available for completeness). */
  async uploadImageFromFile(buffer: Buffer, filename: string): Promise<{ hash: string }> {
    if (this.mockMode) {
      return { hash: `mock_img_${randomId()}` };
    }
    const form = new FormData();
    form.append('access_token', this.accessToken ?? '');
    form.append('source', buffer, { filename });
    const { data } = await this.http.post<{ images: Record<string, { hash: string }> }>(
      `/${this.adAccountPath}/adimages`,
      form,
      { headers: form.getHeaders() }
    );
    const first = Object.values(data.images ?? {})[0];
    if (!first?.hash) {
      throw new MetaApiError('Image upload returned no hash', { details: data });
    }
    return { hash: first.hash };
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.accessToken) {
      throw new MetaApiError('META_PAGE_ACCESS_TOKEN is not configured', { statusCode: 500 });
    }
    const authParams = { access_token: this.accessToken, ...params };

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        logger.info('meta.request', {
          method,
          path,
          params: sanitize(authParams),
          body: sanitize(body),
        });
        const res =
          method === 'get'
            ? await this.http.get<T>(path, { params: authParams })
            : await this.http.post<T>(path, body, { params: { access_token: this.accessToken } });
        logger.info('meta.response', { method, path, data: sanitize(res.data) });
        return res.data;
      } catch (err) {
        const axiosErr = err as AxiosError<MetaErrorBody>;
        const status = axiosErr.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (retryable && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * 2 ** attempt;
          attempt += 1;
          logger.warn('meta.retry', { path, status, attempt, delayMs: delay });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw this.normalizeError(axiosErr, path);
      }
    }
  }

  private normalizeError(err: AxiosError<MetaErrorBody>, path: string): MetaApiError {
    const metaErr = err.response?.data?.error;
    const message = metaErr?.message || err.message || 'Meta API request failed';
    const userMessage = metaErr?.error_user_msg;
    logger.error('meta.error', {
      path,
      status: err.response?.status,
      message,
      userMessage,
      code: metaErr?.code,
      subcode: metaErr?.error_subcode,
      fbtraceId: metaErr?.fbtrace_id,
    });
    return new MetaApiError(message, {
      statusCode: err.response?.status ?? 502,
      metaCode: metaErr?.code,
      metaSubcode: metaErr?.error_subcode,
      fbtraceId: metaErr?.fbtrace_id,
      userMessage,
      details: err.response?.data,
    });
  }
}

export const metaClient = new MetaClient();
