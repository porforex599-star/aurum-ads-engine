import { notifyNewLead } from '../../src/webhooks/notify';
import { NormalizedLead } from '../../src/webhooks/types';

const lead: NormalizedLead = {
  platform: 'meta',
  platformLeadId: 'lead_1',
  platformAdId: 'ad_1',
  platformCampaignId: 'camp_1',
  platformFormId: 'form_1',
  email: 'lead@example.com',
  phone: '+66811111111',
  displayName: 'Por Trader',
  utm: { source: 'facebook', medium: 'paid_social', campaign: 'camp_1' },
  rawPayload: {},
  receivedAt: new Date(),
};

const NOTIFY_ENV = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ADMIN_CHAT_ID',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'LEAD_NOTIFICATION_EMAIL',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_ADMIN_USER_ID',
];

const saved: Record<string, string | undefined> = {};
let fetchMock: jest.Mock;

beforeEach(() => {
  for (const key of NOTIFY_ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  for (const key of NOTIFY_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('notifyNewLead', () => {
  it('skips all channels for a duplicate lead', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 't';
    process.env.TELEGRAM_ADMIN_CHAT_ID = 'c';
    process.env.RESEND_API_KEY = 'r';
    await notifyNewLead(lead, 'db-1', false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silently skips when no channel env vars are set', async () => {
    await expect(notifyNewLead(lead, 'db-1', true)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires Telegram with the correct format', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'BOTTOKEN';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '999';
    await notifyNewLead(lead, 'db-42', true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botBOTTOKEN/sendMessage');
    const sent = JSON.parse(init.body as string);
    expect(sent.chat_id).toBe('999');
    expect(sent.parse_mode).toBe('Markdown');
    expect(sent.text).toContain('New Lead');
    expect(sent.text).toContain('Por Trader');
    expect(sent.text).toContain('lead@example.com');
    expect(sent.text).toContain('db-42');
  });

  it('fires Email (Resend) with the correct format', async () => {
    process.env.RESEND_API_KEY = 'RKEY';
    process.env.RESEND_FROM_EMAIL = 'leads@aurumlive.com';
    process.env.LEAD_NOTIFICATION_EMAIL = 'admin@example.com';
    await notifyNewLead(lead, 'db-7', true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer RKEY');
    const sent = JSON.parse(init.body as string);
    expect(sent.from).toBe('leads@aurumlive.com');
    expect(sent.to).toBe('admin@example.com');
    expect(sent.subject).toContain('New AURUM Lead');
    expect(sent.html).toContain('Por Trader');
    expect(sent.html).toContain('db-7');
  });

  it('fires LINE OA push when configured', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'LINETOKEN';
    process.env.LINE_ADMIN_USER_ID = 'Uadmin';
    await notifyNewLead(lead, 'db-9', true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(init.headers.Authorization).toBe('Bearer LINETOKEN');
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toBe('Uadmin');
    expect(sent.messages[0].text).toContain('New Lead');
  });

  it('does not throw when a channel fetch rejects', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 't';
    process.env.TELEGRAM_ADMIN_CHAT_ID = 'c';
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(notifyNewLead(lead, 'db-1', true)).resolves.toBeUndefined();
  });

  it('fires all three channels in parallel when all configured', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 't';
    process.env.TELEGRAM_ADMIN_CHAT_ID = 'c';
    process.env.RESEND_API_KEY = 'r';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'l';
    process.env.LINE_ADMIN_USER_ID = 'u';
    await notifyNewLead(lead, 'db-1', true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
