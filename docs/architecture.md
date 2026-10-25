# Architecture and reliability contract

## Flow

1. The browser generates a UUID and an immutable order payload.
2. An IndexedDB transaction persists the order before the UI reports it saved.
3. A single foreground drain per tab sends queued payloads to `/api/orders` with a bounded timeout. Multiple tabs may deliver concurrently; server uniqueness handles that safely.
4. The server scopes records by Sites-authenticated user, validates product IDs and quantities, normalizes lines, computes a content hash, and inserts with `ON CONFLICT DO NOTHING`.
5. It reads the winning row. A matching hash returns the same receipt; a mismatch returns 409 without overwriting contents.
6. The browser persists the receipt and marks received. Warehouse acceptance is a separate server operation.

IndexedDB stores orders and a bounded 100-entry local event timeline. Updates merge records atomically within a read/write transaction. A stale queued copy cannot overwrite a received copy. BroadcastChannel informs other tabs. Each account has a distinct local record partition; the workspace's server identity is never supplied by the browser payload.

## What “duplicate-safe” means

There is one row per account and order ID, even under concurrent data/SMS-simulator requests. This is an idempotent storage effect, **not an exactly-once network-delivery guarantee**. A user creating two separate orders with different IDs can still create two business orders. The prototype does not implement stock deduction, charging, or external ERP side effects.

Delivery event insertion occurs after the order insert/read. If that event write fails, the order remains persisted and a retry returns the same receipt. Telemetry counts can therefore be incomplete under server failure. A production transactional outbox would be appropriate before coupling external fulfillment to this receipt.

## Offline behavior

The application shell and same-origin static assets are cached by a service worker after initial online loading. API responses and auth routes are excluded. An initial visit still requires connectivity and authentication. Previously received status is a last-confirmed local copy; a later warehouse decision cannot be learned while offline.

The browser outbox survives refreshes and ordinary browser restarts. It does not survive deliberate site-data deletion, storage eviction, device loss, some private-browsing policies, or physical device failure. Browser storage is not an encrypted vault. Keep the prototype on a trusted device; sign-in does not encrypt existing offline records. Shared-device logout/cache wiping and encryption require a designed product policy before a real pilot.

Retries run while the app is open, on reconnection, every 12 seconds, or through Sync now. There is no claim of reliable closed-app background delivery. Each request has a 10-second timeout. The Weak setting adds 1.6 seconds of simulated pre-delivery latency. It does not model carrier congestion or alter radio service.

## SMS boundary

`channel: sms_simulator` sends an ordinary authenticated HTTP request. This proves same-ID reconciliation at the application boundary. It does not prove SMS reception, delivery time, segmentation, authenticity, cost, radio availability, or gateway integration. A real integration needs a provider adapter with authenticated callbacks, replay-resistant message verification, payload minimization, receipts, and gateway contract testing. Never send a queued payment or label it paid based on a transport receipt.

## Identity and permissions

Hosted requests rely on Sites-owned authentication and account-specific identity headers. The current account acts as both field representative and warehouse operator. Team invitations, role separation, audit retention policies, and organization membership are deliberately pending for the pilot.

The local preview adapter binds to loopback and supplies a fixed QA identity. It is outside the deployed Worker dependency graph. API tests address the raw local Worker and exercise missing identity, separate tenants, cross-origin rejection, and status persistence.

## Limits

The inbox shows the latest 500 server orders. The catalogue is illustrative and prices are server-authoritative constants. No attachment uploads, durable inventory reservations, payment settlement, real SMS gateway, operator network APIs, commercial SLA, or field-validated savings are implemented. These are expansion boundaries rather than hidden mock features.
