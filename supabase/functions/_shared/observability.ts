// Application-owned logs contain codes and random correlation IDs only.
// Gateway/access logs are managed separately by Supabase.
export function observeHandler(name: string, handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    const client = request.headers.get('x-client-info')?.match(/^reppy\/((?:ios-)?[a-f0-9]{40}-(?:local|[0-9]+|drill-(?:baseline|candidate))-[0-9]+) request\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
    const operationId = crypto.randomUUID();
    const base = { event: 'server.request', function: name, operationId,
      release: client?.[1], clientRequestId: client?.[2] };
    const watchdog = setTimeout(() => console.warn(JSON.stringify({ ...base, code: 'PENDING', durationMs: Math.round(performance.now() - started) })), 15000);
    try {
      const response = await handler(request);
      console.log(JSON.stringify({ ...base, status: response.status, durationMs: Math.round(performance.now() - started) }));
      const headers = new Headers(response.headers);
      headers.set('x-reppy-operation-id', operationId);
      headers.set('Access-Control-Expose-Headers', 'x-reppy-operation-id, sb-request-id');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      console.error(JSON.stringify({ ...base, status: 500, code: 'UNHANDLED', durationMs: Math.round(performance.now() - started) }));
      return Response.json({ code: 'internal_error', operationId }, { status: 500, headers: {
        'Access-Control-Allow-Origin': 'https://temarmz.github.io', 'Access-Control-Expose-Headers': 'x-reppy-operation-id', 'x-reppy-operation-id': operationId,
      } });
    } finally { clearTimeout(watchdog); }
  };
}
