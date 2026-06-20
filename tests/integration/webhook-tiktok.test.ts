import { createHmac } from 'crypto';

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

const PATH = '/api/v1/webhooks/tiktok-leads';
const SECRET = process.env.TIKTOK_WEBHOOK_SECRET as string;

function tiktokBody(leadId: string, over: Record<string, unknown> = {}) {
  return {
    event_type: 'LEAD_FORM_SUBMIT',
    client_id: 'client_1',
    timestamp: 1681234567,
    data: {
      lead_id: leadId,
      advertiser_id: 'adv_1',
      campaign_id: 'tt_camp_1',
      adgroup_id: 'tt_ag_1',
      ad_id: 'tt_ad_1',
      form_id: 'tt_form_1',
      field_data: [
        { field_name: 'email', value: 'tt@example.com' },
        { field_name: 'phone_number', value: '+66899999999' },
        { field_name: 'full_name', value: 'Tik Toker' },
      ],
      ...over,
    },
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

describe('POST /api/v1/webhooks/tiktok-leads (mock mode)', () => {
  it('persists a lead with all fields extracted', async () => {
    mockState.creatives.push({ id: 'creative-tt', campaign_id: 'campaign-tt', tiktok_ad_id: 'tt_ad_1' });

    const res = await request(app).post(PATH).send(tiktokBody('tt_lead_1'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0]).toMatchObject({
      source_platform: 'tiktok',
      source_campaign_id: 'campaign-tt',
      source_creative_id: 'creative-tt',
      email: 'tt@example.com',
      phone: '+66899999999',
      display_name: 'Tik Toker',
      status: 'new',
    });
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), 'lead-1', true);
  });

  it('persists with null attribution when the campaign is unknown', async () => {
    const res = await request(app).post(PATH).send(tiktokBody('tt_lead_2', { ad_id: '', campaign_id: 'nope' }));
    expect(res.status).toBe(200);
    expect(mockState.leads[0].source_campaign_id).toBeNull();
  });

  it('is idempotent: duplicate lead_id creates no second row', async () => {
    await request(app).post(PATH).send(tiktokBody('dup_tt'));
    mockNotify.mockClear();
    const res = await request(app).post(PATH).send(tiktokBody('dup_tt'));
    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), 'lead-1', false);
  });

  it('ignores non lead-form events', async () => {
    const res = await request(app)
      .post(PATH)
      .send({ event_type: 'OTHER_EVENT', data: { lead_id: 'x' } });
    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(0);
  });
});

describe('POST /api/v1/webhooks/tiktok-leads (signature enforced)', () => {
  afterEach(() => {
    process.env.WEBHOOK_MOCK_MODE = 'true';
  });

  it('rejects an invalid signature with 401', async () => {
    process.env.WEBHOOK_MOCK_MODE = 'false';
    const raw = JSON.stringify(tiktokBody('sig_tt'));
    const res = await request(app)
      .post(PATH)
      .set('Content-Type', 'application/json')
      .set('X-Tt-Signature', 'deadbeef')
      .send(raw);
    expect(res.status).toBe(401);
    expect(mockState.leads).toHaveLength(0);
  });

  it('accepts a valid signature and persists', async () => {
    process.env.WEBHOOK_MOCK_MODE = 'false';
    const raw = JSON.stringify(tiktokBody('sig_tt_ok'));
    const sig = createHmac('sha256', SECRET).update(Buffer.from(raw)).digest('hex');
    const res = await request(app)
      .post(PATH)
      .set('Content-Type', 'application/json')
      .set('X-Tt-Signature', sig)
      .send(raw);
    expect(res.status).toBe(200);
    expect(mockState.leads).toHaveLength(1);
  });
});
