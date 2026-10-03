import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from '../../api/boros';
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}
describe('Boros public read-only proxy', () => {
  it.each(['POST', 'DELETE', 'PUT'])('blocks %s without contacting Boros', async method => {
    const res = response();
    await handler({ method, url: '/api/boros/simulations/place-order-anonymous' } as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not expose signing or account endpoints', async () => {
    const res = response();
    await handler({ method: 'GET', url: '/api/boros/send-txs/approve' } as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('forwards the rewritten path and read-only oracle query', async () => {
    fetchMock.mockResolvedValue(new Response('{"results":[]}'));
    const res = response();
    await handler({ method: 'GET', url: '/api/boros?__p=/indicators&marketId=128&timeFrame=1d&select=u' } as IncomingMessage, res as unknown as ServerResponse);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api-boros.pendle.finance/apis/v1/indicators?marketId=128&timeFrame=1d&select=u');
    expect(res.statusCode).toBe(200);
  });
});
