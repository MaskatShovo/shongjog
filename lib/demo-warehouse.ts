import { validateOrder, totalOf, payloadHash, type ServerOrder, type OrderPayload } from './domain';
import type { Transport } from './delivery';

// This adapter is ONLY for the explicitly labeled public browser demo.
// It does not send requests, grant production access, or represent a real server.
const DATABASE = 'shongjog-showcase-warehouse-v1';
type State = { orders: ServerOrder[]; metrics: { attempts: number; duplicates: number } };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export const demoTransport: Transport = async (_input, init) => {
  let input: { order?: unknown; channel?: string; id?: string; status?: string } = {};
  try { if (init?.body) input = JSON.parse(String(init.body)); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  let payload: OrderPayload | undefined, hash: string | undefined;
  if (init?.method === 'POST') {
    try { payload = validateOrder(input.order); hash = await payloadHash(payload); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Invalid order.' }, { status: 400 }); }
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'), request = store.get('warehouse');
    let response: Response;
    request.onsuccess = () => {
      const state: State & { hashes?: Record<string, string> } = request.result ?? { orders: [], metrics: { attempts: 0, duplicates: 0 }, hashes: {} };
      if (init?.method === 'POST' && payload && hash) {
        const existing = state.orders.find(order => order.id === payload.id);
        if (existing && state.hashes?.[payload.id] !== hash) { response = Response.json({ error: 'Same order ID, different contents. Original preserved.' }, { status: 409 }); return; }
        const order: ServerOrder = existing ?? { ...payload, receipt: crypto.randomUUID(), receivedAt: new Date().toISOString(), status: 'received', channel: input.channel === 'sms_simulator' ? 'sms_simulator' : 'data', total: totalOf(payload.items), duplicate: false };
        if (!existing) { state.orders.unshift(order); state.hashes = { ...state.hashes, [payload.id]: hash }; }
        state.metrics.attempts++; if (existing) state.metrics.duplicates++;
        response = Response.json({ ...order, duplicate: Boolean(existing) }, { status: existing ? 200 : 201 });
      } else if (init?.method === 'PATCH') {
        const order = state.orders.find(order => order.id === input.id);
        if (!order) { response = Response.json({ error: 'Order not found.' }, { status: 404 }); return; }
        if (input.status !== 'accepted') { response = Response.json({ error: 'Invalid status.' }, { status: 400 }); return; }
        order.status = 'accepted'; response = Response.json({ ok: true });
      } else response = Response.json({ orders: state.orders, metrics: state.metrics });
      store.put(state, 'warehouse');
    };
    tx.oncomplete = () => { db.close(); resolve(response); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
};
