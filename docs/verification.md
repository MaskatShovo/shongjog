# Verification evidence — 26 October 2026

## Automated checks

Four domain tests passed:

- Authoritative catalogue pricing ignores injected client totals/prices.
- Reordered product lines and trimmed shop names normalize to the same hash.
- Changed contents under one ID produce a distinct content hash.
- Unknown products, duplicates, null items, invalid quantities/dates/IDs, and blank names are rejected.

Six API integration tests passed against a built Worker and real local D1 database:

- Unauthenticated reads/writes return 401.
- Twelve simultaneous deliveries across data and simulated SMS create one order, one receipt, and eleven deduplicated deliveries.
- Changed contents return 409 and preserve the original order.
- A second tenant cannot see or accept the first tenant's order.
- Warehouse acceptance persists through replay.
- Malformed JSON, invalid quantity, and cross-origin writes are rejected.

TypeScript checking and the production build passed. Local migration created the actual preview tables.

A later rerun encountered Wrangler's explicit “worker restarted mid-request” 503 response on one request. The integration test replays that original ID once for this specific local infrastructure response; it does not retry application errors or suppress failing assertions. The client already retains queued orders for later retry on failed requests. This is a local runtime interruption, not an absent database binding.

## Browser checks performed through Chrome

- Dashboard rendered without console errors.
- Paused app data, entered a demo order for three rice bags and six oil bottles, and saved it.
- Reloaded; IndexedDB restored the order and paused mode, showing one pending order with value BDT 2,250.
- Restored data; the warehouse received the order. Explicit acceptance succeeded.
- Ran the full resilience drill: persisted record readback, simulated fallback HTTP delivery, data replay, identical receipt, one warehouse row. The drill reported passed.
- Checked the 390×844 responsive layout; no horizontal document overflow was observed.
- Stopped the loopback QA proxy completely, reloaded, and verified the service-worker application shell reopened with local records.
- While the proxy remained unavailable, created a second offline test order, reloaded, and verified it remained pending with its original contents.

The interruption test found an overconfident connection label; it was corrected to show warehouse unreachability on failed requests. Local receipt refresh was also extended to retain the last confirmed warehouse status for offline display.

## Limits of this evidence

The SMS path is simulated and no messages were sent. The browser test stopped the local application connection; it is not a radio/network field trial. Tests used synthetic demo records. No payment, billing, warehouse ERP, separate multi-user team roles, load benchmark, external security review, or paid pilot was performed.


## v1.1 improvement pass

Ten domain/SDK tests and six D1 API integration tests passed locally. The added SDK checks verify payload projection, permanent-versus-temporary errors, malformed success responses, HTML error handling, bounded exponential backoff, timeouts, and explicit acceptance requests. TypeScript, the full-stack build, and the static public demo build passed.

The public browser demo passed its resilience drill using a separate IndexedDB warehouse simulator. It uses the same UI and SDK, with simulation labels visible at the top and inside the lab. Its receipts are browser-local evidence, not server or carrier evidence. GitHub Actions definitions reproduce the automated checks and publish the static demo.
