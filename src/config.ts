import 'dotenv/config';
import { z } from 'zod';

/**
 * Coerce common truthy/falsy string representations to a real boolean.
 * NOTE: z.coerce.boolean() uses JS Boolean() semantics, so the string
 * "false" would incorrectly become `true`. This helper fixes that so
 * META_MOCK_MODE=false actually disables mock mode.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return defaultValue;
      if (typeof val === 'boolean') return val;
      return ['1', 'true', 'yes', 'on'].includes(val.trim().toLowerCase());
    });

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(8080),
  supabase: z.object({
    url: z.string().url(),
    serviceRoleKey: z.string().min(1),
  }),
  apiKey: z.string().min(32, 'AURUM_ADS_ENGINE_API_KEY must be at least 32 characters'),
  meta: z.object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    pageId: z.string().optional(),
    adAccountId: z.string().optional(),
    pageAccessToken: z.string().optional(),
    apiVersion: z.string().default('v23.0'),
    apiBaseUrl: z.string().default('https://graph.facebook.com'),
    mockMode: booleanFromEnv(true),
  }),
  tiktok: z.object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    advertiserId: z.string().optional(),
    accessToken: z.string().optional(),
    pixelId: z.string().optional(),
    apiVersion: z.string().default('v1.3'),
    apiBaseUrl: z.string().default('https://business-api.tiktok.com/open_api'),
    mockMode: booleanFromEnv(true),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    apiKey: process.env.AURUM_ADS_ENGINE_API_KEY,
    meta: {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      pageId: process.env.META_PAGE_ID,
      adAccountId: process.env.META_AD_ACCOUNT_ID,
      pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
      apiVersion: process.env.META_API_VERSION,
      apiBaseUrl: process.env.META_API_BASE_URL,
      mockMode: process.env.META_MOCK_MODE,
    },
    tiktok: {
      appId: process.env.TIKTOK_APP_ID,
      appSecret: process.env.TIKTOK_APP_SECRET,
      advertiserId: process.env.TIKTOK_ADVERTISER_ID,
      accessToken: process.env.TIKTOK_ACCESS_TOKEN,
      pixelId: process.env.TIKTOK_PIXEL_ID,
      apiVersion: process.env.TIKTOK_API_VERSION,
      apiBaseUrl: process.env.TIKTOK_API_BASE_URL,
      mockMode: process.env.TIKTOK_MOCK_MODE,
    },
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const config = loadConfig();
