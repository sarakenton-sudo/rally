import { fetchWithRetry } from '@/lib/fetchRetry';

describe('fetchWithRetry', () => {
  const real = global.fetch;
  afterEach(() => { global.fetch = real; });

  it('retries once after a network failure', async () => {
    const ok = { status: 200 } as Response;
    const f = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(ok);
    global.fetch = f as any;
    await expect(fetchWithRetry('https://x')).resolves.toBe(ok);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not retry server responses or other errors', async () => {
    const bad = { status: 500 } as Response;
    let f = jest.fn().mockResolvedValue(bad);
    global.fetch = f as any;
    await expect(fetchWithRetry('https://x')).resolves.toBe(bad);
    expect(f).toHaveBeenCalledTimes(1);
    f = jest.fn().mockRejectedValue(new Error('boom'));
    global.fetch = f as any;
    await expect(fetchWithRetry('https://x')).rejects.toThrow('boom');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gives up after the one retry', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    global.fetch = f as any;
    await expect(fetchWithRetry('https://x')).rejects.toThrow('Network request failed');
    expect(f).toHaveBeenCalledTimes(2);
  });
});
