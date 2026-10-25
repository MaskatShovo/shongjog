# Shongjog: when “Submit” is not the end of the story

**Author:** Maskat Ibne Wahid Shovo · **Stage:** working independent prototype · **Market hypothesis:** distributor field sales in Bangladesh.

A field representative submits a shop order, connectivity disappears, and the confirmation never arrives. Retrying may create a duplicate. Giving up may leave a legitimate order unrecorded. The first product decision was to make uncertainty visible rather than displaying an optimistic success message.

## The product decision

Shongjog separates three facts: saved on this device, received by the warehouse, and explicitly accepted. It persists the order before attempting delivery. A representative keeps working during an outage and can inspect what has actually been confirmed.

## The engineering decision

The client creates one immutable order ID. The server normalizes and hashes the contents and enforces a unique account/order key. A delayed fallback delivery and a later data retry both resolve to one receipt. Different contents under the same ID are rejected. This protects the storage effect without claiming exactly-once network delivery or implementing financial settlement.

The transport-independent SDK validates success responses, classifies temporary and permanent errors, and supports bounded retries. IndexedDB transactions merge local records across tabs. The service worker prepares the application shell for reopening without a connection.

## The demonstration

The resilience lab saves an order while the app's data channel is paused, reads it back from persistent storage, delivers via simulated SMS, replays via data, and verifies a single receipt. A browser-only public showcase uses the same interface and SDK with an explicitly simulated warehouse. The private full-stack app uses D1 and authenticated requests.

The public demo is a way to examine the interaction and algorithm. It is not evidence that carrier SMS, production capacity, or a real distributor workflow has been validated.

## The business decision

Start with one distributor, one warehouse, and ten representatives. Measure confirmation latency, manual follow-up calls, duplicates, and cost against a baseline. Test an actual budget owner's willingness to pay before calling it a business. A telecom enterprise channel is a possible partner; no operator relationship is asserted.

## Evidence and next steps

See [verification](verification.md) for tests and their limits, [architecture](architecture.md) for failure semantics, and [pilot plan](pilot-plan.md) for validation. The remaining boundaries include real SMS integration, organization roles, attachments, ERP integration, and field trials.

**Interview demonstration:** “I'll cut the connection, reopen the app, and replay the delivery. Let's inspect the receipt together.”
