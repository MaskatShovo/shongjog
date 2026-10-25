import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, payloadHash, totalOf } from '../lib/domain.ts';
const sample = () => ({ id: crypto.randomUUID(), shop: 'রহমান স্টোর', area: 'Mirpur, Dhaka', createdAt: new Date().toISOString(), items: [{ productId: 'rice', quantity: 3 }, { productId: 'oil', quantity: 6 }], demo: true });
test('server computes totals from the trusted catalogue', () => {
  const input = { ...sample(), total: 1, price: 0 };
  const normalized = validateOrder(input);
  assert.equal(totalOf(normalized.items), 2250);
  assert.equal('total' in normalized, false);
});
test('reordered lines and whitespace normalize to the same content hash', async () => {
  const order = sample();
  assert.equal(await payloadHash(validateOrder(order)), await payloadHash(validateOrder({ ...order, shop: '  ' + order.shop + ' ', items: order.items.toReversed() })));
});
test('changed contents generate a different hash under the same order ID', async () => {
  const order = sample();
  assert.notEqual(await payloadHash(validateOrder(order)), await payloadHash(validateOrder({ ...order, items: [{ productId: 'rice', quantity: 4 }] })));
});
test('invalid and malicious order contents are rejected', () => {
  for (const items of [[], [null], [{ productId: 'unknown', quantity: 1 }], [{ productId: 'rice', quantity: 0 }], [{ productId: 'rice', quantity: -1 }], [{ productId: 'rice', quantity: 1.5 }], [{ productId: 'rice', quantity: 501 }], [{ productId: 'rice', quantity: 1 }, { productId: 'rice', quantity: 2 }]]) {
    assert.throws(() => validateOrder({ ...sample(), items }));
  }
  for (const patch of [{ id: '../../id' }, { shop: ' ' }, { area: '' }, { createdAt: 'tomorrow' }]) assert.throws(() => validateOrder({ ...sample(), ...patch }));
});
