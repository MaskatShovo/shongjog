import { env } from 'cloudflare:workers';
import { payloadHash, totalOf, validateOrder } from '../../../lib/domain';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function tenant(req: Request) { return req.headers.get('oai-authenticated-user-id'); }
function sameOrigin(req: Request) { const origin = req.headers.get('origin'); return !origin || origin === new URL(req.url).origin; }
export async function GET(req: Request) {
  const user = tenant(req); if (!user) return reply({ error: 'Sign in to access your workspace.' }, 401);
  if (!env.DB) return reply({ error: 'Database is unavailable.' }, 503);
  const rows = await env.DB.prepare('SELECT * FROM orders WHERE tenant = ? ORDER BY received_at DESC LIMIT 500').bind(user).all();
  const metrics = await env.DB.prepare('SELECT COUNT(*) AS attempts, COALESCE(SUM(duplicate),0) AS duplicates FROM deliveries WHERE tenant = ?').bind(user).first();
  return reply({ orders: rows.results.map((r: Record<string, unknown>) => ({ ...JSON.parse(String(r.payload)), total: r.total, receipt: r.receipt, receivedAt: r.received_at, status: r.status, channel: r.channel, duplicate: false })), metrics });
}
export async function POST(req: Request) {
  const user = tenant(req); if (!user) return reply({ error: 'Sign in to sync your orders.' }, 401);
  if (!sameOrigin(req)) return reply({ error: 'Cross-origin writes are not allowed.' }, 403);
  if (!env.DB) return reply({ error: 'Database is unavailable.' }, 503);
  const body = await req.text(); if (body.length > 16000) return reply({ error: 'Order is too large.' }, 413);
  let data, payload;
  try { data = JSON.parse(body); payload = validateOrder(data.order); } catch (e) { return reply({ error: e instanceof Error ? e.message : 'Invalid order.' }, 400); }
  const channel = data.channel === 'sms_simulator' ? 'sms_simulator' : 'data';
  const hash = await payloadHash(payload), now = new Date().toISOString(), receipt = crypto.randomUUID();
  const result = await env.DB.prepare("INSERT INTO orders (tenant,id,hash,payload,total,receipt,received_at,status,channel) VALUES (?,?,?,?,?,?,?,'received',?) ON CONFLICT(tenant,id) DO NOTHING").bind(user, payload.id, hash, JSON.stringify(payload), totalOf(payload.items), receipt, now, channel).run();
  const saved = await env.DB.prepare('SELECT * FROM orders WHERE tenant = ? AND id = ?').bind(user, payload.id).first();
  if (!saved || saved.hash !== hash) return reply({ error: 'This order ID already belongs to different contents. The existing order was preserved.' }, 409);
  const duplicate = result.meta.changes === 0;
  await env.DB.prepare('INSERT INTO deliveries (id,tenant,order_id,at,duplicate,channel) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), user, payload.id, now, duplicate ? 1 : 0, channel).run();
  return reply({ receipt: saved.receipt, receivedAt: saved.received_at, status: saved.status, total: saved.total, channel: saved.channel, duplicate }, duplicate ? 200 : 201);
}
export async function PATCH(req: Request) {
  const user = tenant(req); if (!user) return reply({ error: 'Sign in required.' }, 401);
  if (!sameOrigin(req)) return reply({ error: 'Cross-origin writes are not allowed.' }, 403);
  if (!env.DB) return reply({ error: 'Database is unavailable.' }, 503);
  let data; try { data = await req.json() as { id: string; status: string }; } catch { return reply({ error: 'Invalid request.' }, 400); }
  if (!data || !['accepted', 'received'].includes(data.status) || typeof data.id !== 'string') return reply({ error: 'Invalid status.' }, 400);
  const result = await env.DB.prepare('UPDATE orders SET status = ? WHERE tenant = ? AND id = ?').bind(data.status, user, data.id).run();
  return result.meta.changes ? reply({ ok: true }) : reply({ error: 'Order not found.' }, 404);
}
