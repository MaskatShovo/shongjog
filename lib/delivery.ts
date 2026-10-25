import type { OrderPayload, Receipt, ServerOrder } from './domain';

export type Transport = (input: string, init?: RequestInit) => Promise<Response>;
export class DeliveryError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status = 0) {
    super(message); this.name = 'DeliveryError'; this.status = status;
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  }
}
export const retryDelay = (attempt: number) => Math.min(120000, 2000 * 2 ** Math.min(6, Math.max(0, attempt - 1)));

/** Transport-independent delivery SDK. Retries must reuse the original order ID. */
export class DeliveryClient {
  private transport: Transport;
  constructor(transport: Transport = (input, init) => fetch(input, init)) { this.transport = transport; }
  private async request(method: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.transport('/api/orders', { method, cache: 'no-store', signal: AbortSignal.timeout(10000), ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    } catch { throw new DeliveryError('The warehouse could not be reached. Your saved order will retry safely.'); }
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new DeliveryError('The warehouse returned an unreadable response. Your saved order is retained.', response.status >= 400 ? response.status : 502); }
    if (!response.ok) {
      const error = data && typeof data === 'object' && 'error' in data ? String(data.error) : response.status === 401 ? 'Sign in again to resume delivery.' : 'Delivery was not confirmed.';
      throw new DeliveryError(error, response.status);
    }
    return data;
  }
  async send(order: OrderPayload, channel: 'data' | 'sms_simulator' = 'data'): Promise<Receipt> {
    // Never include browser-only queue/error/receipt metadata in an immutable payload.
    const payload: OrderPayload = { id: order.id, shop: order.shop, area: order.area, createdAt: order.createdAt, items: order.items, demo: order.demo };
    const data = await this.request('POST', { order: payload, channel }) as Partial<Receipt> | null;
    if (!data || typeof data.receipt !== 'string' || !data.receipt || typeof data.receivedAt !== 'string' || !Number.isFinite(Date.parse(data.receivedAt)) || !['received','accepted'].includes(String(data.status)) || !Number.isFinite(data.total) || typeof data.duplicate !== 'boolean' || !['data','sms_simulator'].includes(String(data.channel))) throw new DeliveryError('The warehouse response had no valid receipt. Your saved order is retained.', 502);
    return data as Receipt;
  }
  async list(): Promise<{ orders: ServerOrder[]; metrics: { attempts: number; duplicates: number } }> {
    const data = await this.request('GET') as { orders?: ServerOrder[]; metrics?: { attempts: number; duplicates: number } } | null;
    if (!data || !Array.isArray(data.orders) || !data.metrics) throw new DeliveryError('The warehouse list was incomplete.', 502);
    return data as { orders: ServerOrder[]; metrics: { attempts: number; duplicates: number } };
  }
  async accept(id: string) { await this.request('PATCH', { id, status: 'accepted' }); }
}
