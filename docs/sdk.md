# Delivery SDK

`lib/delivery.ts` is a transport-independent TypeScript client. It is used by both the real app and the browser showcase, so the same receipt validation and failure semantics are exercised in both experiences.

```ts
import { DeliveryClient, DeliveryError, retryDelay } from './lib/delivery';

const client = new DeliveryClient(); // same-origin authenticated HTTP
try {
  const receipt = await client.send(savedImmutableOrder, 'data');
  // Persist receipt before marking the local record received.
} catch (error) {
  if (error instanceof DeliveryError && error.retryable) {
    // Keep the ORIGINAL order ID and payload; schedule the next attempt.
    const dueAt = Date.now() + retryDelay(attemptNumber);
  } else {
    // Preserve the record for inspection. Do not spin on a rejected payload.
  }
}
```

The browser application owns durable queue storage and scheduling. The SDK owns transport, bounded request timeouts, HTTP error classification, payload projection, and receipt validation. It deliberately does not invent an order ID when retrying.

Retryable: transport failure, 408, 429, and 5xx. Attention required: other 4xx responses including invalid input, expired authentication, and conflicting contents. Backoff begins at two seconds and is capped at two minutes. The foreground scheduler checks every twelve seconds; **Sync now** explicitly bypasses the waiting deadline.

A success response with no receipt, invalid timestamp, invalid status/channel, non-numeric total, or missing duplicate flag is treated as unconfirmed. HTML error pages do not become false successful deliveries. External code must still persist successful receipts and provide the authenticated hosting boundary.

Custom transports implement `(url: string, init?: RequestInit) => Promise<Response>`. The public showcase uses `lib/demo-warehouse.ts`, a separately labeled IndexedDB warehouse simulator. It does not grant production access or send SMS.
