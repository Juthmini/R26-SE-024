// UNIT TESTS - Frontend AI-coach service (the network call is faked)
import { fetchPersonalizedCoach } from '../../../src/services/caregiver/llmService';
import { authFetch } from '@/src/api/authApi';

jest.mock('@/src/api/authApi', () => ({ authFetch: jest.fn() }));
const mockFetch = authFetch as jest.Mock;

const recs: any[] = [{ id: 'sleep', title: 'Sleep', primaryCause: 'Low sleep', recommendations: ['Sleep early'], reason: 'long private text', icon: 'x' }];
const weekly: any = { riskLevel: 'High', trend: 'worsening', daysAnalyzed: 5 };

beforeEach(() => mockFetch.mockReset());

describe('fetchPersonalizedCoach', () => {
  test('UT-FE-36 returns the personalised message when the server succeeds', async () => {
    mockFetch.mockResolvedValue({ success: true, personalized: { message: 'Hi', notes: { sleep: 'Rest' } } });
    expect(await fetchPersonalizedCoach('High', 8, weekly, recs)).toEqual({ message: 'Hi', notes: { sleep: 'Rest' } });
  });

  test('UT-FE-37 returns null when the server says AI is unavailable (personalized:null)', async () => {
    mockFetch.mockResolvedValue({ success: true, personalized: null });
    expect(await fetchPersonalizedCoach('High', 8, weekly, recs)).toBeNull();
  });

  test('UT-FE-38 returns null when success is false', async () => {
    mockFetch.mockResolvedValue({ success: false });
    expect(await fetchPersonalizedCoach('High', 8, weekly, recs)).toBeNull();
  });

  test('UT-FE-39 returns null (no crash) when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    expect(await fetchPersonalizedCoach('High', 8, weekly, recs)).toBeNull();
  });

  test('UT-FE-40 posts to the right URL and sends only id/title/cause/actions (no long reasons)', async () => {
    mockFetch.mockResolvedValue({ success: true, personalized: null });
    await fetchPersonalizedCoach('High', 8, weekly, recs);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/caregiver/ai-coach/personalize');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.stressLevel).toBe('High');
    expect(body.recs[0]).toEqual({ id: 'sleep', title: 'Sleep', primaryCause: 'Low sleep', recommendations: ['Sleep early'] });
  });
});
