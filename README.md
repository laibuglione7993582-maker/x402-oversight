# x402-oversight

Oversight and governance wrapper for [x402](https://www.x402.org/) payments. Drop-in `fetch` replacement that enforces spend caps and captures a transaction record for every paid request from an AI agent.

## Install

```bash
npm install x402-oversight
```

Requires Node 18+ (for global `fetch`).

## Quick start

```ts
import { createOversight } from "x402-oversight";

const oversight = createOversight({
  agent: "researcher-01",
  budget: {
    perCall: 0.05,
    hourly: 25,
    daily: 100,
  },
  onRecord: (record) => {
    console.log("[oversight]", record.status, record.endpoint, `$${record.amount}`);
  },
});

const { response, record } = await oversight.fetch(
  "https://api.example.com/data",
);

console.log(await response.json());
console.log("spent so far:", oversight.snapshot());
```

## What it does

1. You call `oversight.fetch(url)` instead of `fetch(url)`.
2. If the server responds `402 Payment Required`, the wrapper:
   - Reads the price from the `x-payment-amount-usd` header
   - Checks it against your `perCall`, `hourly`, `daily`, and `lifetime` caps
   - Throws `BudgetExceededError` if any cap would be exceeded
   - Otherwise retries the request with an `x-payment-authorization` header
3. Every outcome (success, blocked, error) is emitted to `onRecord` with:
   - unique record id
   - agent identifier
   - endpoint
   - amount
   - tx hash (when provided by the server)
   - timestamp
   - status

## API

### `createOversight(options): Oversight`

| Option | Type | Description |
|--------|------|-------------|
| `agent` | `string` | Identifier for the calling agent. Required. |
| `budget.perCall` | `number?` | Max spend per single call, in USD. |
| `budget.hourly` | `number?` | Max spend per rolling hour, in USD. |
| `budget.daily` | `number?` | Max spend per rolling day, in USD. |
| `budget.lifetime` | `number?` | Hard cap across the lifetime of this oversight instance, in USD. |
| `onRecord` | `(r) => void \| Promise<void>` | Called after every transaction. Use this to write to your log store. |
| `fetch` | `typeof fetch` | Custom fetch implementation. Defaults to `globalThis.fetch`. |

### `oversight.fetch(input, init?): Promise<PaymentResponse>`

Same signature as the global `fetch`, but returns `{ response, record }`.

### `oversight.snapshot()`

Returns the running totals and the configured budget.

### `BudgetExceededError`

Thrown before the second (paid) request is sent when any cap would be breached. Has `kind` (which cap), `limit`, and `wouldSpend` fields.

## License

MIT
