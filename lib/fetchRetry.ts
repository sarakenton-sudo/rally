/**
 * fetch with one quiet retry on a network-level failure ("TypeError: Network
 * request failed"). iOS can hand a request a connection that went stale while
 * the user was filling in a form; the first tap fails, the second works.
 * Only network errors are retried — server responses (4xx/5xx) are returned as-is.
 */
export const fetchWithRetry: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (e: any) {
    if (init?.signal?.aborted || !(e instanceof TypeError)) throw e;
    await new Promise((r) => setTimeout(r, 600));
    return fetch(input, init);
  }
};
