import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const orders = sqliteTable('orders', {
  tenant: text('tenant').notNull(), id: text('id').notNull(), hash: text('hash').notNull(),
  payload: text('payload').notNull(), total: integer('total').notNull(),
  receipt: text('receipt').notNull(), receivedAt: text('received_at').notNull(),
  status: text('status').notNull().default('received'), channel: text('channel').notNull(),
}, table => [primaryKey({ columns: [table.tenant, table.id] })]);
export const deliveries = sqliteTable('deliveries', {
  id: text('id').primaryKey(), tenant: text('tenant').notNull(), orderId: text('order_id').notNull(),
  at: text('at').notNull(), duplicate: integer('duplicate').notNull(), channel: text('channel').notNull(),
});
