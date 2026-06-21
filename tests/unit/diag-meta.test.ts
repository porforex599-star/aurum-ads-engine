// Configure Meta env BEFORE importing diag so the config singleton snapshots
// these values (config.ts reads process.env once, at import time).
process.env.META_APP_ID = 'app123';
process.env.META_APP_SECRET = 'secret123';
process.env.META_BUSINESS_ID = '1019647013846047';
process.env.META_PIXEL_ID = '27029724233335965';
process.env.META_PAGE_ID = '368335886371070';
process.env.META_AD_ACCOUNT_ID = 'act_1401442098706403';
process.env.META_PAGE_ACCESS_TOKEN = 'test-token';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify';

import { runMetaDiagnostics, GraphGet } from '../../src/platforms/meta/diag';

const REQUIRED_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'leads_retrieval',
];

function happyResponses(): Record<string, any> {
  return {
    '/debug_token': {
      data: {
        app_id: 'app123',
        type: 'USER',
        is_valid: true,
        expires_at: 0,
        scopes: [...REQUIRED_SCOPES],
        user_id: 'u1',
        granular_scopes: [{ scope: 'pages_show_list', target_ids: ['368335886371070'] }],
      },
    },
    '/me/accounts': {
      data: [
        { id: '368335886371070', name: 'Property Wealth', access_token: 'pat' },
        { id: '1222826830904926', name: 'Aurum Bot Official', access_token: 'pat2' },
      ],
    },
    '/act_1401442098706403': {
      id: 'act_1401442098706403',
      name: 'AURUM Ad Account',
      account_status: 1,
      currency: 'THB',
      timezone_name: 'Asia/Bangkok',
      business: { id: '1019647013846047' },
      funding_source_details: { display_string: 'Visa **** 1111' },
    },
    '/27029724233335965': {
      id: '27029724233335965',
      name: 'AURUM AI Pixel',
      owner_business: { id: '1019647013846047' },
    },
    '/368335886371070': {
      id: '368335886371070',
      name: 'Property Wealth',
      category: 'Business',
      tasks: ['ADVERTISE', 'MANAGE', 'ANALYZE'],
    },
    '/368335886371070/leadgen_forms': { data: [] },
  };
}

function makeGet(map: Record<string, any>): GraphGet {
  return async (path) => {
    if (path in map) {
      const v = map[path];
      if (v instanceof Error) throw v;
      return v;
    }
    throw new Error(`unexpected graph path: ${path}`);
  };
}

describe('runMetaDiagnostics', () => {
  it('returns the documented shape and ok:true on the happy path', async () => {
    const report = await runMetaDiagnostics(makeGet(happyResponses()));

    expect(report.ok).toBe(true);
    expect(report.engineVersion).toBe('0.5.2');
    expect(typeof report.generatedAt).toBe('string');
    expect(Object.keys(report.checks)).toEqual([
      'envVars',
      'token',
      'token.scopeCoverage',
      'pages',
      'adAccount',
      'pixel',
      'page',
      'leadForms',
    ]);

    expect(report.checks.envVars.ok).toBe(true);
    expect(report.checks.token).toMatchObject({ ok: true, type: 'USER', isValid: true });
    expect(report.checks['token.scopeCoverage']).toMatchObject({ ok: true, missing: [] });
    expect(report.checks.pages).toMatchObject({
      ok: true,
      mismatch: false,
      configuredPageId: '368335886371070',
      pageAccessTokenAvailable: true,
    });
    expect(report.checks.adAccount).toMatchObject({ ok: true, status: 1, businessIdMatches: true });
    expect(report.checks.pixel).toMatchObject({ ok: true, name: 'AURUM AI Pixel', businessIdMatches: true });
    expect(report.checks.page).toMatchObject({ ok: true, hasAdvertiseTask: true, hasManageTask: true });
    expect(report.checks.leadForms).toMatchObject({ ok: true, count: 0 });
  });

  it('flags an invalid token', async () => {
    const r = happyResponses();
    r['/debug_token'] = { data: { type: 'USER', is_valid: false, scopes: [] } };
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.token.ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it('reports missing scopes with remediation for hard-to-grant ones', async () => {
    const r = happyResponses();
    r['/debug_token'].data.scopes = ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement'];
    const report = await runMetaDiagnostics(makeGet(r));
    const cov = report.checks['token.scopeCoverage'];
    expect(cov.ok).toBe(false);
    expect(cov.missing).toEqual(['pages_manage_metadata', 'leads_retrieval']);
    expect(cov.remediation).toMatch(/System User/);
  });

  it('flags a page-not-in-scope mismatch and skips page/leadForms', async () => {
    const r = happyResponses();
    r['/me/accounts'] = { data: [{ id: '1222826830904926', name: 'Aurum Bot Official', access_token: 'pat2' }] };
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.pages).toMatchObject({ ok: false, mismatch: true });
    expect(report.checks.pages.sample).toEqual([{ id: '1222826830904926', name: 'Aurum Bot Official' }]);
    expect((report.checks.page as any).skipped).toBe(true);
    expect((report.checks.leadForms as any).skipped).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('flags an ad account owned by a different business', async () => {
    const r = happyResponses();
    r['/act_1401442098706403'].business = { id: '999999' };
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.adAccount).toMatchObject({ ok: false, businessIdMatches: false });
  });

  it('flags a disabled ad account', async () => {
    const r = happyResponses();
    r['/act_1401442098706403'].account_status = 2;
    r['/act_1401442098706403'].disable_reason = 1;
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.adAccount.ok).toBe(false);
    expect(report.checks.adAccount).toMatchObject({ disableReason: 1 });
  });

  it('flags a pixel owned by a different business', async () => {
    const r = happyResponses();
    r['/27029724233335965'].owner_business = { id: '888' };
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.pixel).toMatchObject({ ok: false, businessIdMatches: false });
  });

  it('flags a page missing the ADVERTISE task', async () => {
    const r = happyResponses();
    r['/368335886371070'].tasks = ['MANAGE', 'ANALYZE'];
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.page).toMatchObject({ ok: false, hasAdvertiseTask: false, hasManageTask: true });
  });

  it('captures a Graph error for the lead-forms check without throwing', async () => {
    const r = happyResponses();
    r['/368335886371070/leadgen_forms'] = Object.assign(new Error('x'), {
      response: { data: { error: { message: '(#10) leads_retrieval permission required' } } },
    });
    const report = await runMetaDiagnostics(makeGet(r));
    expect(report.checks.leadForms.ok).toBe(false);
    expect((report.checks.leadForms as any).error).toMatch(/leads_retrieval/);
  });

  it('flags missing required env vars', async () => {
    const saved = process.env.META_BUSINESS_ID;
    delete process.env.META_BUSINESS_ID;
    try {
      const report = await runMetaDiagnostics(makeGet(happyResponses()));
      expect(report.checks.envVars.ok).toBe(false);
      expect(report.checks.envVars.missing).toContain('META_BUSINESS_ID');
    } finally {
      process.env.META_BUSINESS_ID = saved;
    }
  });
});
