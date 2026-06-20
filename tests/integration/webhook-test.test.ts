// Phase 1 companion · POST /api/v1/webhooks/test (mock-mode lead injector).
//
// Guards the two bugs found during /leads verification:
//   1. display_name from the request body must land in leads.display_name.
//   2. platformCampaignId must resolve to leads.source_campaign_id via the
//      per-platform ad_campaigns id column (meta_campaign_id / tiktok_campaign_id),
//      with an unresolved breadcrumb when no campaign matches.

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

const PATH = '/api/v1/webhooks/test';

beforeEach(() => {
  mockState.leads.length = 0;
  mockState.creatives.length = 0;
  mockState.campaigns.length = 0;
  mockState.seq = 0;
  mockNotify.mockClear();
  process.env.WEBHOOK_MOCK_MODE = 'true';
});

describe('POST /api/v1/webhooks/test', () => {
  it('round-trips display_name from the request body into leads.display_name', async () => {
    const res = await request(app)
      .post(PATH)
      .send({ display_name: 'Por Test', email: 'a@b.com', phone: '+66891234567' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, display_name: 'Por Test' });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0]).toMatchObject({
      display_name: 'Por Test',
      email: 'a@b.com',
      phone: '+66891234567',
    });
  });

  it('resolves source_campaign_id for Meta via meta_campaign_id', async () => {
    mockState.campaigns.push({ id: 'camp-meta-1', meta_campaign_id: 'mock_camp_xyz' });

    const res = await request(app)
      .post(PATH)
      .send({ platform: 'meta', display_name: 'Meta Lead', platformCampaignId: 'mock_camp_xyz' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, source_campaign_id: 'camp-meta-1' });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0].source_campaign_id).toBe('camp-meta-1');
  });

  it('resolves source_campaign_id for TikTok via tiktok_campaign_id', async () => {
    mockState.campaigns.push({ id: 'camp-tt-1', tiktok_campaign_id: 'mock_camp_tt' });

    const res = await request(app)
      .post(PATH)
      .send({ platform: 'tiktok', display_name: 'TikTok Lead', platformCampaignId: 'mock_camp_tt' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, source_campaign_id: 'camp-tt-1' });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0].source_campaign_id).toBe('camp-tt-1');
  });

  it('breadcrumbs an unresolved campaign id and leaves source_campaign_id NULL', async () => {
    const res = await request(app)
      .post(PATH)
      .send({ platform: 'meta', display_name: 'Orphan Lead', platformCampaignId: 'no_such_campaign' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, source_campaign_id: null });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0].source_campaign_id).toBeNull();
    const tags = mockState.leads[0].tags as Record<string, unknown>;
    expect(tags.platform_campaign_id_unresolved).toBe('no_such_campaign');
  });

  it('stays backward compatible: a body without display_name inserts with NULL name', async () => {
    const res = await request(app)
      .post(PATH)
      .send({ platform: 'meta', email: 'legacy@b.com', phone: '+66800000000' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(mockState.leads).toHaveLength(1);
    expect(mockState.leads[0].display_name).toBeNull();
    expect(res.body.display_name).toBeNull();
  });
});
