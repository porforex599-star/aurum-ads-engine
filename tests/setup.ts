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
process.env.LOG_LEVEL = 'error';
