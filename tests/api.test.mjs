import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:8787';
const tenant = 'qa-' + crypto.randomUUID();
const order = { id: crypto.randomUUID(), shop: 'QA fixture · Rahman Store', area: 'Mirpur, Dhaka', createdAt: new Date().toISOString(), items: [{ productId: 'rice', quantity: 3 }, { productId: 'oil', quantity: 6 }], demo: true };
async function api(method, body, user = tenant, extra = {}) {
  const response = await fetch(base + '/api/orders', { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), 'Content-Type': 'application/json', ...extra }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  // Finish the response lifecycle even when a test asserts only the status.
  await response.clone().arrayBuffer();
  return response;
}
test('unauthenticated reads and writes are rejected', async () => {
  assert.equal((await api('GET', null, null)).status, 401);
  assert.equal((await api('POST', { order }, null)).status, 401);
});
test('concurrent data and simulated SMS deliveries create one order and one receipt', async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const body = { order, channel: i % 2 ? 'sms_simulator' : 'data' };
    let response = await api('POST', body);
    // Wrangler can restart a local isolate between requests. Retry only that
    // explicit infrastructure response, with the ORIGINAL immutable order ID.
    if (response.status === 503 && (await response.clone().text()).startsWith('Your worker restarted mid-request.')) {
      console.log('Local Wrangler restarted one request; replaying its original order ID.');
      response = await api('POST', body);
    }
    return response;
  }));
  for (const response of responses) assert.ok(response.ok, `Unexpected concurrent response ${response.status}: ${response.ok ? '' : await response.clone().text()}`);
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => r.status === 200).length, 11);
  const receipts = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(receipts.map(r => r.receipt)).size, 1);
  assert.equal(receipts.filter(r => r.duplicate).length, 11);
  assert.ok(receipts.every(r => r.total === 2250));
  const state = await (await api('GET')).json();
  assert.equal(state.orders.filter(o => o.id === order.id).length, 1);
  assert.equal(state.metrics.duplicates, 11);
});
test('conflicting contents never overwrite the accepted payload', async () => {
  assert.equal((await api('POST', { order: { ...order, shop: 'Different shop' } })).status, 409);
  const state = await (await api('GET')).json();
  assert.equal(state.orders.find(o => o.id === order.id).shop, order.shop);
});
test('a tenant cannot see or update another tenant’s orders', async () => {
  const other = tenant + '-other';
  assert.equal((await (await api('GET', null, other)).json()).orders.length, 0);
  assert.equal((await api('PATCH', { id: order.id, status: 'accepted' }, other)).status, 404);
});
test('warehouse acceptance persists and survives delivery replay', async () => {
  assert.equal((await api('PATCH', { id: order.id, status: 'accepted' })).status, 200);
  const replay = await (await api('POST', { order })).json();
  assert.equal(replay.status, 'accepted'); assert.equal(replay.duplicate, true);
});
test('malformed payloads, price injection, and cross-origin writes', async () => {
  assert.equal((await api('POST', '{')).status, 400);
  assert.equal((await api('POST', { order: { ...order, items: [{ productId: 'rice', quantity: -5 }] } })).status, 400);
  assert.equal((await api('POST', { order }, tenant, { Origin: 'https://unrelated.invalid' })).status, 403);
});
