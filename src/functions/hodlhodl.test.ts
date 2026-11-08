import { fetchValidHodlHodlOfferIds } from './index';

describe('fetchValidHodlHodlOfferIds', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null when the request fails, so no offer gets hidden', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(fetchValidHodlHodlOfferIds()).resolves.toBeNull();
  });

  it('returns null when the API answers with an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(fetchValidHodlHodlOfferIds()).resolves.toBeNull();
  });

  it('returns the active offer ids, requested through the CORS proxy', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ offers: [{ id: 'a' }, { id: 'b' }] }),
    });
    global.fetch = fetchMock;

    await expect(fetchValidHodlHodlOfferIds()).resolves.toEqual(new Set(['a', 'b']));
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/corsproxy\.io\/\?https%3A%2F%2Fhodlhodl\.com/);
  });

  it('returns null when a later page fails, instead of a partial list', async () => {
    const fullPage = { offers: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(fetchValidHodlHodlOfferIds()).resolves.toBeNull();
  });
});
