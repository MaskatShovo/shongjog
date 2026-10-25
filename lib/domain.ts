export const PRODUCTS = [
  { id: 'rice', name: 'Miniket rice', bn: 'মিনিকেট চাল', unit: '5 kg bag', price: 380, color: '#ede6ce', code: 'RC' },
  { id: 'oil', name: 'Soybean oil', bn: 'সয়াবিন তেল', unit: '1 L bottle', price: 185, color: '#f6e5b2', code: 'OL' },
  { id: 'lentils', name: 'Red lentils', bn: 'মসুর ডাল', unit: '1 kg pack', price: 140, color: '#f3d2bc', code: 'DL' },
  { id: 'flour', name: 'Whole wheat flour', bn: 'আটা', unit: '2 kg pack', price: 125, color: '#e7decd', code: 'FL' },
  { id: 'tea', name: 'Black tea', bn: 'চা', unit: '200 g pack', price: 110, color: '#d7e3cc', code: 'TE' },
  { id: 'soap', name: 'Laundry soap', bn: 'কাপড় কাচার সাবান', unit: '4 bar pack', price: 120, color: '#d5e7f1', code: 'SP' },
] as const;
export type OrderPayload = { id: string; shop: string; area: string; createdAt: string; items: { productId: string; quantity: number }[]; demo: boolean };
export type Receipt = { receipt: string; receivedAt: string; status: string; channel: string; total: number; duplicate: boolean };
export type LocalOrder = OrderPayload & { state: 'queued' | 'received' | 'conflict'; savedAt: string; receipt?: Receipt; error?: string; interrupted?: boolean };
export type ServerOrder = OrderPayload & Receipt;
export type Trace = { id: string; at: string; label: string; detail: string; kind: 'info' | 'success' | 'warning' };
export const money = (n: number) => '৳' + n.toLocaleString('en-BD');
export function totalOf(items: OrderPayload['items']) {
  return items.reduce((sum, item) => sum + (PRODUCTS.find(p => p.id === item.productId)?.price ?? 0) * item.quantity, 0);
}
export function validateOrder(value: unknown): OrderPayload {
  if (!value || typeof value !== 'object') throw new Error('Order is required.');
  const x = value as Record<string, unknown>;
  if (typeof x.id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(x.id)) throw new Error('Invalid order ID.');
  if (typeof x.shop !== 'string' || !x.shop.trim() || x.shop.length > 80) throw new Error('Enter a shop name (up to 80 characters).');
  if (typeof x.area !== 'string' || !x.area.trim() || x.area.length > 80) throw new Error('Enter an area (up to 80 characters).');
  if (typeof x.createdAt !== 'string' || !Number.isFinite(Date.parse(x.createdAt))) throw new Error('Invalid order date.');
  if (!Array.isArray(x.items) || x.items.length < 1 || x.items.length > PRODUCTS.length) throw new Error('Choose at least one product.');
  const seen = new Set<string>();
  const items = x.items.map((v: Record<string, unknown>) => {
    if (!v || typeof v.productId !== 'string' || !PRODUCTS.some(p => p.id === v.productId) || seen.has(v.productId)) throw new Error('Invalid or repeated product.');
    if (!Number.isInteger(v.quantity) || Number(v.quantity) < 1 || Number(v.quantity) > 500) throw new Error('Quantity must be between 1 and 500.');
    seen.add(v.productId);
    return { productId: v.productId, quantity: Number(v.quantity) };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
  return { id: x.id, shop: x.shop.trim(), area: x.area.trim(), createdAt: x.createdAt, items, demo: x.demo === true };
}
export async function payloadHash(payload: OrderPayload) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
