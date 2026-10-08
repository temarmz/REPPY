import { recordPersistence } from './persistence-diagnostics.ts';

export function createBoundedFetch(fetcher: typeof fetch = globalThis.fetch, timeoutMs = 12000): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Uploads/videos have their own lifecycle; limit database and Auth JSON only.
    if (!/\/rest\/v1\/|\/auth\/v1\//.test(url)) return fetcher(input, init);
    const operation = /\/auth\/v1\//.test(url) ? 'auth.request' : 'database.request';
    const started = performance.now();
    const controller = new AbortController();
    const parent = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(parent?.reason);
    if (parent?.aborted) abort();
    parent?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      // Keep the deadline until the body arrives, not just the response headers.
      const body = await response.arrayBuffer();
      recordPersistence(operation, response.ok ? 'success' : 'error', started, { code: `HTTP_${response.status}` });
      return new Response([204, 205, 304].includes(response.status) || init?.method === 'HEAD' ? null : body,
        { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (reason) {
      if (timedOut) {
        const error = Object.assign(new Error('Сервер долго не отвечает. Изменения ожидают повторного сохранения.'), { name: 'AbortError', code: 'REPPY_TIMEOUT' });
        recordPersistence(operation, 'error', started, error);
        throw error;
      }
      recordPersistence(operation, 'error', started, { code: parent?.aborted ? 'REPPY_CANCELLED' : 'REPPY_NETWORK' });
      throw reason;
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    }
  };
}
