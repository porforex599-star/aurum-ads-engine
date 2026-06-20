import { normalizeMetaLead, normalizeTiktokLead } from '../../src/webhooks/normalize';

describe('normalizeTiktokLead', () => {
  it('normalizes a full lead', () => {
    const payload = {
      event_type: 'LEAD_FORM_SUBMIT',
      data: {
        lead_id: 'tt_lead_1',
        advertiser_id: 'adv_1',
        campaign_id: 'tt_camp_1',
        adgroup_id: 'tt_ag_1',
        ad_id: 'tt_ad_1',
        form_id: 'tt_form_1',
        field_data: [
          { field_name: 'email', value: 'por@example.com' },
          { field_name: 'phone_number', value: '+66811111111' },
          { field_name: 'full_name', value: 'Por Trader' },
        ],
      },
    };
    const lead = normalizeTiktokLead(payload);
    expect(lead).toMatchObject({
      platform: 'tiktok',
      platformLeadId: 'tt_lead_1',
      platformAdId: 'tt_ad_1',
      platformCampaignId: 'tt_camp_1',
      platformFormId: 'tt_form_1',
      email: 'por@example.com',
      phone: '+66811111111',
      displayName: 'Por Trader',
      utm: { source: 'tiktok', medium: 'paid_social', campaign: 'tt_camp_1' },
    });
    expect(lead.receivedAt).toBeInstanceOf(Date);
  });

  it('handles case-insensitive + alternate field names', () => {
    const lead = normalizeTiktokLead({
      data: {
        lead_id: 'x',
        field_data: [
          { field_name: 'EMAIL', value: 'UP@example.com' },
          { field_name: 'PHONE', value: '0900000000' },
          { field_name: 'first_name', value: 'Por' },
          { field_name: 'last_name', value: 'Smith' },
        ],
      },
    });
    expect(lead.email).toBe('UP@example.com');
    expect(lead.phone).toBe('0900000000');
    expect(lead.displayName).toBe('Por Smith');
  });

  it('handles missing fields gracefully', () => {
    const lead = normalizeTiktokLead({ data: { lead_id: 'y' } });
    expect(lead.email).toBeUndefined();
    expect(lead.phone).toBeUndefined();
    expect(lead.displayName).toBeUndefined();
    expect(lead.platformAdId).toBe('');
  });

  it('handles an empty / garbage payload without throwing', () => {
    const lead = normalizeTiktokLead({});
    expect(lead.platform).toBe('tiktok');
    expect(lead.platformLeadId).toBe('');
  });
});

describe('normalizeMetaLead', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockGraph(detail: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => detail,
    }) as unknown as typeof fetch;
  }

  it('fetches the Graph API then normalizes all fields', async () => {
    mockGraph({
      id: 'lead_1',
      ad_id: 'meta_ad_1',
      campaign_id: 'meta_camp_1',
      form_id: 'meta_form_1',
      field_data: [
        { name: 'email', values: ['lead@example.com'] },
        { name: 'phone_number', values: ['+66822222222'] },
        { name: 'full_name', values: ['Meta Lead'] },
      ],
    });

    const lead = await normalizeMetaLead('lead_1', 'token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/lead_1?');
    expect(calledUrl).toContain('access_token=token');

    expect(lead).toMatchObject({
      platform: 'meta',
      platformLeadId: 'lead_1',
      platformAdId: 'meta_ad_1',
      platformCampaignId: 'meta_camp_1',
      platformFormId: 'meta_form_1',
      email: 'lead@example.com',
      phone: '+66822222222',
      displayName: 'Meta Lead',
      utm: { source: 'facebook', medium: 'paid_social', campaign: 'meta_camp_1' },
    });
  });

  it('handles alternate/case-insensitive field names and first+last name', async () => {
    mockGraph({
      id: 'lead_2',
      field_data: [
        { name: 'EMAIL_ADDRESS', values: ['alt@example.com'] },
        { name: 'Phone', values: ['0811112222'] },
        { name: 'first_name', values: ['Som'] },
        { name: 'last_name', values: ['Chai'] },
      ],
    });
    const lead = await normalizeMetaLead('lead_2', 'token');
    expect(lead.email).toBe('alt@example.com');
    expect(lead.phone).toBe('0811112222');
    expect(lead.displayName).toBe('Som Chai');
  });

  it('handles missing fields gracefully', async () => {
    mockGraph({ id: 'lead_3', field_data: [] });
    const lead = await normalizeMetaLead('lead_3', 'token');
    expect(lead.email).toBeUndefined();
    expect(lead.phone).toBeUndefined();
    expect(lead.displayName).toBeUndefined();
    expect(lead.platformCampaignId).toBe('');
  });

  it('throws when the Graph API returns a non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad token',
    }) as unknown as typeof fetch;
    await expect(normalizeMetaLead('lead_4', 'token')).rejects.toThrow(/Graph API lead fetch failed/);
  });
});
