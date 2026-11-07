import { APP_RELEASE } from './release.ts';
import { recordPersistence } from './persistence-diagnostics.ts';

export function createBoundedFetch(fetcher: typeof fetch = globalThis.fetch, timeoutMs = 12000): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Uploads/videos have their own lifecycle; limit Supabase JSON APIs only.
    if (!/\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//.test(url)) return fetcher(input, init);
    const operation = /\/auth\/v1\//.test(url) ? 'auth.request'
      : /\/functions\/v1\//.test(url) ? 'function.request'
        : 'database.request';
    const started = performance.now();
    const operationId = crypto.randomUUID();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('x-client-info', `reppy/${APP_RELEASE} request/${operationId}`);
    const controller = new AbortController();
    const parent = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(parent?.reason);
    if (parent?.aborted) abort();
    parent?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(input, { ...init, headers, signal: controller.signal });
      // Keep the deadline until the body arrives, not just the response headers.
      const body = await response.arrayBuffer();
      recordPersistence(operation, response.ok ? 'success' : 'error', started, { code: `HTTP_${response.status}` }, operationId, (response.headers.get('x-reppy-operation-id') ?? response.headers.get('sb-request-id')) ?? undefined);
      return new Response([204, 205, 304].includes(response.status) || init?.method === 'HEAD' ? null : body,
        { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (reason) {
      if (timedOut) {
        const error = Object.assign(new Error('Сервер долго не отвечает. Изменения ожидают повторного сохранения.'), { name: 'AbortError', code: 'REPPY_TIMEOUT' });
        recordPersistence(operation, 'error', started, error, operationId);
        throw error;
      }
      recordPersistence(operation, 'error', started, { code: parent?.aborted ? 'REPPY_CANCELLED' : 'REPPY_NETWORK' }, operationId);
      throw reason;
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    }
  };
}
