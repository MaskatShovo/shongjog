# Shongjog — Business, uninterrupted.

A working, private prototype of a business-continuity layer for field sales in Bangladesh. Orders are saved on the device before delivery. A warehouse API issues durable receipts, rejects conflicting payloads, and reconciles repeated deliveries to one order.

Created by **Maskat Ibne Wahid Shovo** as an independent product and engineering portfolio project. No Banglalink affiliation, endorsement, network access, or customer deployment is claimed.

## What works

- Responsive mission control, field orders, warehouse inbox, resilience lab, and business case.
- English/Bangla product-entry labels and an illustrative BDT catalogue.
- IndexedDB outbox, atomic cross-tab record merging, and cross-tab update notifications.
- Service-worker application shell and asset caching for offline reopening after initial preparation.
- Authenticated, account-scoped D1 storage through Sites-provided identity.
- Server validation and authoritative catalogue pricing.
- Unique `(tenant, order ID)` constraint and normalized SHA-256 content verification.
- Concurrent retries return the same receipt; changed contents under an existing ID return HTTP 409.
- Separate saved, received, and warehouse-accepted states.
- Bounded request timeouts and periodic safe retries, with visible failure states.
- SMS-channel simulator that invokes the real API; **no real SMS is sent**.
- Repeatable resilience drill with an event timeline and downloadable JSON evidence.
- Editable pilot economics with explicitly illustrative assumptions.

## Demonstrate it in two minutes

1. Open the hosted app and sign in. Your workspace starts empty.
2. Open **Resilience lab → Run resilience drill**.
3. Watch device persistence, simulated fallback delivery, and data replay resolve to one receipt.
4. Open **Warehouse**, inspect the receipt, and accept the order.
5. For a manual experiment, choose **Cut data**, create an order, reload, and observe it remains pending. Restore **Online** to deliver it.
6. Replay a delayed SMS with the row's message action. The duplicate counter increases; order count does not.
7. Export the evidence. Demo records are explicitly labeled.

**“Cut data” is an application-level simulation, not control of a phone's radio.** Actual offline reopening is supported by the installed service worker after it caches the shell and required assets. Do not clear browser site data while orders are pending. A complete connectivity outage cannot deliver remote orders. The SMS simulator also needs an actual connection to the server.

## Local development

Requires Node.js 22.13+ (Node 24 tested), npm, and Git. Use `npm ci` on a fresh checkout.

```sh
npm ci
npm run db:generate # only when changing the schema; don't regenerate applied migrations
npm run build
```

For an existing checkout, **do not regenerate** the committed initial migration. Apply it once to the local preview database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fearless_rumiko_fujikawa.sql
```

Preview the built application using two terminals:

```sh
npm start -- --port 8787
```

```sh
node scripts/preview-local.mjs
```

Open **http://127.0.0.1:4173**. The loopback-only QA proxy supplies a simulated local identity. It is never included in deployed Worker code. Production identity comes from the Sites authentication boundary. The ordinary built Worker on port 8787 rejects requests without identity.

Alternatively, `npm run dev` supports the starter's loopback-only mock sign-in flow at `/signin-with-chatgpt?return_to=/`. The service worker is enabled only in production builds; use the built preview to test offline reopening.

## Verification

```sh
npm test
npm run typecheck
npm run test:api # built Worker must be running on port 8787
npm run build
```

The API tests use isolated, randomly named QA tenants in the **local** database. They do not reset databases or delete data. See [verification.md](docs/verification.md) for actual results and [architecture.md](docs/architecture.md) for guarantees and limits.

## API

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/orders` | Latest 500 account-scoped orders and delivery counters |
| POST | `/api/orders` | Validate, insert or reconcile, issue existing/new receipt |
| PATCH | `/api/orders` | Explicit warehouse acceptance or return to received |

All API responses are private and uncacheable. Writes reject cross-origin browser requests. The hosting layer must authenticate visitors and sanitize identity headers; do not expose the raw Worker as a public standalone service without replacing that boundary.

## Moving toward a paid pilot

The next work is customer validation, separate team memberships/roles, a provider-approved SMS gateway, compact authenticated message encoding, attachment storage with a separate upload queue, catalogue/ERP integration, and operational monitoring. Offline order value is not realized revenue. No billing, payments, stock reservation, real SMS, AI predictions, or field-performance gains are claimed.

The proposed commercial model is a distributor subscription per active representative, with messaging costs separated. The in-app calculator is a hypothesis tool, not a price quote or forecast. See [pilot-plan.md](docs/pilot-plan.md).
