// Force real (non-mock) Meta mode BEFORE importing the app so the orchestrator
// actually drives the (mocked) axios client and we exercise the error path.
process.env.META_MOCK_MODE = 'false';

import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const axiosInstance = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
mockedAxios.create.mockReturnValue(axiosInstance as never);

// Persistence is never reached (orchestration fails first), but mock it so the
// route module's import is inert.
jest.mock('../../src/db/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) }) },
}));

import request from 'supertest';
import { app } from '../../src/server';

const API_KEY = process.env.AURUM_ADS_ENGINE_API_KEY as string;

const body = {
  name: 'AURUM_AI_LeadGen_Error_Test',
  dailyBudget: 30000,
  // Empty interests so resolveInterests makes no Graph calls; the campaign
  // create is the first outbound call and the one we fail.
  targeting: { ageMin: 28, ageMax: 55, interests: [] },
  schedule: { startTime: '2026-06-20T00:00:00+07:00' },
  leadGenForm: {
    headline: 'h',
    description: 'd',
    privacyPolicyUrl: 'https://aurumlive.com/privacy',
    thankYouTitle: 't',
    thankYouBody: 'b',
    thankYouButtonText: 'go',
    thankYouButtonUrl: 'https://aurumlive.com',
  },
  ads: [
    {
      name: 'Ad1',
      imageUrl: 'https://aurumlive.com/img/ad1.jpg',
      primaryText: 'p',
      headline: 'AI gold',
      callToActionType: 'LEARN_MORE',
    },
  ],
};

describe('POST /api/v1/campaigns · Meta error surfacing', () => {
  it('returns 502 with details.metaError.userMsg when Meta rejects the create', async () => {
    axiosInstance.post.mockRejectedValueOnce({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          error: {
            message: 'Invalid parameter',
            error_user_msg: 'The Page you selected is not connected to this ad account.',
            error_user_title: 'Invalid Page',
            code: 100,
            error_subcode: 1487,
            type: 'OAuthException',
            fbtrace_id: 'TRACE123',
          },
        },
      },
    });

    const res = await request(app).post('/api/v1/campaigns').set('X-API-Key', API_KEY).send(body);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('orchestration_failed');
    expect(res.body.message).toBe('The Page you selected is not connected to this ad account.');

    const m = res.body.details.metaError;
    expect(m.stepKey).toBe('create_campaign');
    expect(m.httpStatus).toBe(400);
    expect(m.code).toBe(100);
    expect(m.subcode).toBe(1487);
    expect(m.fbtraceId).toBe('TRACE123');
    expect(m.userTitle).toBe('Invalid Page');
    expect(m.userMsg).toBe('The Page you selected is not connected to this ad account.');
    expect(m.requestPath).toContain('/campaigns');
    expect(m.requestPayload).toMatchObject({ name: body.name, special_ad_categories: ['NONE'] });
    expect(res.body.details.rolledBack).toBe(0);
  });
});
