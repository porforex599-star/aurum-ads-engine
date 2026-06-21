import { MetaApiError, redactSecrets } from '../../src/lib/errors';

describe('redactSecrets', () => {
  it('redacts top-level token/secret/key-shaped keys (case-insensitive)', () => {
    const out = redactSecrets({
      access_token: 'abc',
      App_Secret: 'shh',
      apiKey: 'k',
      Authorization_Key: 'z',
      name: 'campaign',
    }) as Record<string, unknown>;

    expect(out.access_token).toBe('[REDACTED]');
    expect(out.App_Secret).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.Authorization_Key).toBe('[REDACTED]');
    expect(out.name).toBe('campaign');
  });

  it('redacts nested keys inside objects and arrays', () => {
    const out = redactSecrets({
      level1: {
        page_access_token: 'nested',
        items: [{ secretSauce: 'x', label: 'ok' }, { plain: 1 }],
      },
    }) as any;

    expect(out.level1.page_access_token).toBe('[REDACTED]');
    expect(out.level1.items[0].secretSauce).toBe('[REDACTED]');
    expect(out.level1.items[0].label).toBe('ok');
    expect(out.level1.items[1].plain).toBe(1);
  });

  it('leaves non-sensitive primitives untouched', () => {
    expect(redactSecrets('hello')).toBe('hello');
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
  });
});

describe('MetaApiError', () => {
  it('redacts the request payload (incl. nested token/secret/key) on construction', () => {
    const err = new MetaApiError('Invalid parameter', {
      stepKey: 'create_campaign',
      httpStatus: 400,
      requestPayload: {
        name: 'AURUM',
        access_token: 'SUPER_SECRET',
        object_story_spec: { page_id: '123', api_key: 'k', appSecret: 's' },
      },
    });

    const payload = err.requestPayload as any;
    expect(payload.access_token).toBe('[REDACTED]');
    expect(payload.object_story_spec.api_key).toBe('[REDACTED]');
    expect(payload.object_story_spec.appSecret).toBe('[REDACTED]');
    expect(payload.object_story_spec.page_id).toBe('123');
    expect(payload.name).toBe('AURUM');
  });

  it('maps the full Meta error envelope onto typed fields', () => {
    const err = new MetaApiError('Invalid parameter', {
      stepKey: 'create_leadgen_form',
      httpStatus: 400,
      code: 100,
      subcode: 1487,
      type: 'OAuthException',
      fbtraceId: 'AbCdEf',
      userTitle: 'Something went wrong',
      userMsg: 'The page is not accessible',
      errorData: { blame_field_specs: [['name']] },
      requestPath: '/v23.0/123/leadgen_forms',
      rawError: { message: 'Invalid parameter' },
    });

    expect(err.stepKey).toBe('create_leadgen_form');
    expect(err.httpStatus).toBe(400);
    expect(err.statusCode).toBe(400); // AppError status mirrors httpStatus
    expect(err.metaCode).toBe(100);
    expect(err.metaSubcode).toBe(1487);
    expect(err.type).toBe('OAuthException');
    expect(err.fbtraceId).toBe('AbCdEf');
    expect(err.userTitle).toBe('Something went wrong');
    expect(err.userMsg).toBe('The page is not accessible');
    expect(err.errorData).toEqual({ blame_field_specs: [['name']] });
    expect(err.requestPath).toBe('/v23.0/123/leadgen_forms');
  });

  it('keeps Phase 2 backward-compat aliases', () => {
    const err = new MetaApiError('boom', {
      httpStatus: 400,
      code: 200,
      subcode: 99,
      userMsg: 'human readable',
    });
    expect(err.metaCode).toBe(200);
    expect(err.metaSubcode).toBe(99);
    expect(err.userMessage).toBe('human readable');
  });

  it('accepts legacy statusCode/metaCode/userMessage option names', () => {
    const err = new MetaApiError('legacy', {
      statusCode: 500,
      metaCode: 1,
      metaSubcode: 2,
      userMessage: 'legacy msg',
    });
    expect(err.httpStatus).toBe(500);
    expect(err.metaCode).toBe(1);
    expect(err.metaSubcode).toBe(2);
    expect(err.userMsg).toBe('legacy msg');
  });
});
