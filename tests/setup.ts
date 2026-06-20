// Jest global env setup. Runs before any module (incl. config.ts) is imported,
// so the Zod-validated config loads cleanly with mock-mode test values.
process.env.NODE_ENV = 'test';
process.env.PORT = '8080';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.AURUM_ADS_ENGINE_API_KEY = 'test-api-key-0123456789abcdef0123456789abcdef';
process.env.META_MOCK_MODE = 'true';
process.env.META_API_VERSION = 'v23.0';
process.env.META_API_BASE_URL = 'https://graph.facebook.com';
process.env.META_AD_ACCOUNT_ID = 'act_23845968344460231';
process.env.META_PAGE_ID = '1234567890';
process.env.META_PAGE_ACCESS_TOKEN = 'test-page-access-token';
process.env.TIKTOK_MOCK_MODE = 'true';
process.env.TIKTOK_API_VERSION = 'v1.3';
process.env.TIKTOK_API_BASE_URL = 'https://business-api.tiktok.com/open_api';
process.env.TIKTOK_ADVERTISER_ID = '7000000000000000001';
process.env.TIKTOK_ACCESS_TOKEN = 'test-tiktok-access-token';
process.env.TIKTOK_PIXEL_ID = 'D8QGJRRC77U082M868CG';
process.env.LOG_LEVEL = 'error';

// Phase 1 · webhook test defaults. Mock mode bypasses signature checks; tests
// that exercise signature failure flip WEBHOOK_MOCK_MODE to 'false' locally
// (getWebhookConfig reads process.env at request time).
process.env.WEBHOOK_MOCK_MODE = 'true';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
process.env.TIKTOK_WEBHOOK_SECRET = 'test-tiktok-secret';
