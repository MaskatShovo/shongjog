import type { LocalOrder, Trace } from './domain';
const DB_NAME = 'shongjog-device-v1';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export async function readDevice(tenant: string): Promise<{ orders: LocalOrder[]; traces: Trace[] }> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly'), req = tx.objectStore('records').get(tenant);
    req.onsuccess = () => resolve(req.result?.value ?? { orders: [], traces: [] });
    req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
export async function writeDevice(tenant: string, value: { orders: LocalOrder[]; traces: Trace[] }): Promise<{ orders: LocalOrder[]; traces: Trace[] }> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'), req = store.get(tenant);
    let merged = value;
    req.onsuccess = () => {
      const old = req.result?.value as typeof value | undefined;
      const orders = new Map((old?.orders ?? []).map(order => [order.id, order]));
      for (const order of value.orders) {
        const prior = orders.get(order.id);
        orders.set(order.id, prior?.state === 'received' && order.state !== 'received' ? prior : order);
      }
      const traces = new Map([...(old?.traces ?? []), ...value.traces].map(trace => [trace.id, trace]));
      merged = { orders: [...orders.values()].sort((a,b) => b.savedAt.localeCompare(a.savedAt)), traces: [...traces.values()].sort((a,b) => b.at.localeCompare(a.at)).slice(0,100) };
      store.put({ key: tenant, value: merged });
    };
    tx.oncomplete = () => { db.close(); const channel = new BroadcastChannel('shongjog-device'); channel.postMessage('updated'); channel.close(); resolve(merged); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
