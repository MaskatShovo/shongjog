import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryClient, DeliveryError, retryDelay } from '../lib/delivery.ts';
const order = { id: crypto.randomUUID(), shop: 'SDK test', area: 'Dhaka', createdAt: new Date().toISOString(), items: [{ productId: 'rice', quantity: 1 }], demo: true };
const receipt = { receipt: 'test-receipt', status: 'received', receivedAt: new Date().toISOString(), channel: 'data', total: 380, duplicate: false };
test('SDK retains the original payload ID and omits local queue metadata', async () => {
  let sent;
  const client = new DeliveryClient(async (_url, init) => { sent = JSON.parse(init.body); return Response.json(receipt, {status:201}); });
  await client.send({ ...order, state: 'queued', error: 'private queue metadata' });
  assert.equal(sent.order.id, order.id); assert.equal('state' in sent.order, false); assert.equal('error' in sent.order, false);
});
test('conflicts and authentication errors never trigger automatic retry', async () => {
  for (const status of [400,401,403,409,413]) {
    const client = new DeliveryClient(async () => Response.json({error:'Rejected'}, {status}));
    await assert.rejects(client.send(order), e => e instanceof DeliveryError && !e.retryable && e.status === status);
  }
});
test('network errors, throttling, and server failures are retryable', async () => {
  for (const status of [408,429,500,503]) {
    await assert.rejects(new DeliveryClient(async () => Response.json({error:'Temporary'}, {status})).send(order), e => e.retryable);
  }
  await assert.rejects(new DeliveryClient(async () => {throw new TypeError('offline');}).send(order), e => e.retryable && e.status === 0);
});
test('HTML failures and malformed success bodies never become confirmed receipts', async () => {
  const cases = [new Response('<html>Restarting</html>', {status:503}),Response.json({ok:true}),Response.json({...receipt,duplicate:undefined}),Response.json({...receipt,total:'380'})];
  for (const response of cases) await assert.rejects(new DeliveryClient(async () => response).send(order), DeliveryError);
});
test('automatic retry delay is exponential and bounded', () => {
  assert.equal(retryDelay(1),2000); assert.equal(retryDelay(2),4000); assert.equal(retryDelay(5),32000); assert.equal(retryDelay(100),120000);
});
test('transport receives an abort signal and warehouse acceptance uses a separate request', async () => {
  let sent;
  await new DeliveryClient(async (_url, init) => { sent=init; return Response.json({ok:true}); }).accept(order.id);
  assert.equal(sent.method,'PATCH'); assert.ok(sent.signal instanceof AbortSignal); assert.deepEqual(JSON.parse(sent.body),{id:order.id,status:'accepted'});
});
