import { createHmac } from 'crypto';

// ---- Stateful in-memory Supabase mock -----------------------------------
// Names are prefixed with `mock` so Jest allows referencing them inside the
// hoisted jest.mock factory.
const mockState = {
  leads: [] as Array<Record<string, unknown>>,
  creatives: [] as Array<Record<string, unknown>>,
  campaigns: [] as Array<Record<string, unknown>>,
  seq: 0,
};

jest.mock('../../src/db/supabase', () => {
  const matches = (row: Record<string, unknown>, filters: Array<[string, unknown]>) =>
    filters.every(([col, val]) => {
      if (col === 'tags->>source_lead_id') {
        const tags = row.tags as Record<string, unknown> | undefined;
        return tags?.source_lead_id === val;
      }
      return row[col] === val;
    });

  const resolveSelect = (table: string, filters: Array<[string, unknown]>) => {
    const store =
      table === 'leads' ? mockState.leads : table === 'ad_creatives' ? mockState.creatives : mockState.campaigns;
    const found = store.find((row) => matches(row, filters));
    return { data: found ?? null, error: null };
  };

  const makeQuery = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let pendingInsert: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (row: Record<string, unknown>) => {
        pendingInsert = row;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return builder;
      },
      maybeSingle: async () => resolveSelect(table, filters),
      single: async () => {
        if (pendingInsert) {
          mockState.seq += 1;
          const id = `lead-${mockState.seq}`;
          mockState.leads.push({ id, ...pendingInsert });
          return { data: { id }, error: null };
        }
        return resolveSelect(table, filters);
      },
    };
    return builder;
  };

  return { supabase: { from: (table: string) => makeQuery(table) } };
});

const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/webhooks/notify', () => ({
  notifyNewLead: (...args: unknown[]) => mockNotify(...args),
  getNotificationReadiness: () => ({ telegram: false, email: false, lineOA: false }),
}));

import request from 'supertest';
import { app } from '../../src/server';

const PATH = '/api/v1/webhooks/meta-leads';
const APP_SECRET = process.env.META_APP_SECRET as string;

function metaBody(leadgenId: string, adId = 'meta_ad_1') {
  return {
    object: 'page',
    entry: [
      {
        id: 'PAGE_1',
        time: 1681234567,
        changes: [
          {
            field: 'leadgen',
            value: { ad_id: adId, form_id: 'form_1', leadgen_id: leadgenId, page_id: 'PAGE_1' },
          },
        ],
      },
    ],
  };
}

function mockGraph(detail: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => detail,
    text: async () => '',
  }) as unknown as typeof fetch;
}

function graphDetail(over: Record<string, unknown> = {}) {
  return {
    id: 'lead_x',
    ad_id: 'meta_ad_1',
    campaign_id: 'meta_camp_1',
    form_id: 'form_1',
    field_data: [
      { name: 'email', values: ['lead@example.com'] },
      { name: 'phone_number', values: ['+66811111111'] },
      { name: 'full_name', values: ['Por Trader'] },
    ],
    ...over,
  };
}

beforeEach(() => {
  mockState.leads.length = 0;
  mockState.creatives.length = 0;
  mockState.campaigns.length = 0;
  mockState.seq = 0;
  mockNotify.mockClear();
  process.env.WEBHOOK_MOCK_MODE = 'true';
});

describe('GET /api/v1/webhooks/meta-leads (verification)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const res = await request(app).get(PATH).query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': '1234567890',
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1234567890');
  });

  it('returns 403 when the verify token is wrong', async () => {
    const res = await request(app).get(PATH).query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'WRONG',
      'hub.challenge': '1234567890',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/webhooks/meta-leads (mock mode)', () => {
  it('persists a lead and resolves attribution via the creative', async () => {
    mockState.creatives.push({ id: 'creative-1', campaign_id: 'campaign-1', meta_ad_id: 'meta_ad_1' });
    mockGraph(graphDetail());

    const res = await request(app).post(PATH).send(metaBody('lead_1'));

    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0]).toMatchObject({
      source_platform: 'facebook',
      source_campaign_id: 'campaign-1',
      source_creative_id: 'creative-1',
      email: 'lead@example.com',
      display_name: 'Por Trader',
      status: 'new',
    });
    expect((mockState.leads[0].tags as Record<string, unknown>).source_lead_id).toBe('lead_1');
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), 'lead-1', true);
  });

  it('still persists when the ad is unknown (source_campaign_id null)', async () => {
    mockGraph(graphDetail({ ad_id: 'unknown_ad', campaign_id: 'unknown_camp' }));

    const res = await request(app).post(PATH).send(metaBody('lead_2', 'unknown_ad'));

    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0].source_campaign_id).toBeNull();
    expect(mockState.leads[0].source_creative_id).toBeNull();
  });

  it('is idempotent: a duplicate leadgen_id creates no second row + no notification', async () => {
    mockGraph(graphDetail());

    await request(app).post(PATH).send(metaBody('dup_lead'));
    mockNotify.mockClear();
    const res = await request(app).post(PATH).send(metaBody('dup_lead'));

    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), 'lead-1', false);
  });

  it('returns 200 even when the Graph API fetch fails (no retry storm)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'expired token',
    }) as unknown as typeof fetch;

    const res = await request(app).post(PATH).send(metaBody('lead_err'));
    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(0);
  });
});

describe('POST /api/v1/webhooks/meta-leads (signature enforced)', () => {
  afterEach(() => {
    process.env.WEBHOOK_MOCK_MODE = 'true';
  });

  it('rejects an invalid signature with 401', async () => {
    process.env.WEBHOOK_MOCK_MODE = 'false';
    const raw = JSON.stringify(metaBody('lead_sig'));
    const res = await request(app)
      .post(PATH)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(401);
    expect(mockState.leads).toHaveLength(0);
  });

  it('accepts a valid signature and persists', async () => {
    process.env.WEBHOOK_MOCK_MODE = 'false';
    mockGraph(graphDetail());
    const raw = JSON.stringify(metaBody('lead_sig_ok'));
    const sig = 'sha256=' + createHmac('sha256', APP_SECRET).update(Buffer.from(raw)).digest('hex');

    const res = await request(app)
      .post(PATH)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(raw);

    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
  });
});
