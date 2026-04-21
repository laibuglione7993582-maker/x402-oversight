/**
 * x402-oversight
 *
 * Oversight and governance wrapper for x402 payments.
 * Drop-in fetch wrapper that enforces spend caps and records transactions.
 */

export interface BudgetLimits {
  /** Maximum spend per individual call, in whole USD */
  perCall?: number;
  /** Maximum spend per rolling hour, in whole USD */
  hourly?: number;
  /** Maximum spend per rolling day, in whole USD */
  daily?: number;
  /** Hard lifetime cap for this agent, in whole USD */
  lifetime?: number;
}

export interface TransactionRecord {
  id: string;
  agent: string;
  endpoint: string;
  amount: number;
  txHash?: string;
  timestamp: number;
  status: "success" | "blocked" | "error";
  reason?: string;
}

export interface OversightOptions {
  /** Identifier for the calling agent (used in records and budget scoping) */
  agent: string;
  /** Spend limits applied to this agent */
  budget?: BudgetLimits;
  /** Called after every transaction (including blocked ones) */
  onRecord?: (record: TransactionRecord) => void | Promise<void>;
  /** Underlying fetch implementation. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface PaymentResponse {
  response: Response;
  record: TransactionRecord;
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly kind: keyof BudgetLimits,
    public readonly limit: number,
    public readonly wouldSpend: number,
  ) {
    super(
      `x402-oversight: ${kind} budget would be exceeded ` +
        `(limit $${limit}, attempt $${wouldSpend.toFixed(3)})`,
    );
    this.name = "BudgetExceededError";
  }
}

interface Ledger {
  total: number;
  hourWindow: { since: number; amount: number };
  dayWindow: { since: number; amount: number };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function emptyLedger(): Ledger {
  const now = Date.now();
  return {
    total: 0,
    hourWindow: { since: now, amount: 0 },
    dayWindow: { since: now, amount: 0 },
  };
}

function rollWindow(
  window: { since: number; amount: number },
  span: number,
  now: number,
) {
  if (now - window.since >= span) {
    window.since = now;
    window.amount = 0;
  }
}

function parsePaymentRequired(res: Response): number {
  const header = res.headers.get("x-payment-amount-usd");
  if (header) {
    const parsed = Number.parseFloat(header);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function randomId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/**
 * Wrap fetch with budget enforcement and transaction logging.
 *
 * Usage:
 * ```ts
 * import { createOversight } from "x402-oversight";
 *
 * const oversight = createOversight({
 *   agent: "researcher-01",
 *   budget: { perCall: 0.05, hourly: 25, daily: 100 },
 *   onRecord: (r) => console.log("[oversight]", r),
 * });
 *
 * const { response, record } = await oversight.fetch("https://api.example.com/data");
 * ```
 */
export function createOversight(options: OversightOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "x402-oversight: no fetch implementation found. Pass options.fetch or run on Node 18+.",
    );
  }

  const ledger = emptyLedger();
  const budget = options.budget ?? {};

  async function emit(record: TransactionRecord) {
    if (options.onRecord) {
      await options.onRecord(record);
    }
  }

  function assertWithinBudget(amount: number) {
    const now = Date.now();
    rollWindow(ledger.hourWindow, HOUR_MS, now);
    rollWindow(ledger.dayWindow, DAY_MS, now);

    if (budget.perCall !== undefined && amount > budget.perCall) {
      throw new BudgetExceededError("perCall", budget.perCall, amount);
    }
    if (
      budget.hourly !== undefined &&
      ledger.hourWindow.amount + amount > budget.hourly
    ) {
      throw new BudgetExceededError(
        "hourly",
        budget.hourly,
        ledger.hourWindow.amount + amount,
      );
    }
    if (
      budget.daily !== undefined &&
      ledger.dayWindow.amount + amount > budget.daily
    ) {
      throw new BudgetExceededError(
        "daily",
        budget.daily,
        ledger.dayWindow.amount + amount,
      );
    }
    if (
      budget.lifetime !== undefined &&
      ledger.total + amount > budget.lifetime
    ) {
      throw new BudgetExceededError(
        "lifetime",
        budget.lifetime,
        ledger.total + amount,
      );
    }
  }

  function commitSpend(amount: number) {
    ledger.total += amount;
    ledger.hourWindow.amount += amount;
    ledger.dayWindow.amount += amount;
  }

  async function oversightFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<PaymentResponse> {
    const endpoint =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const first = await fetchImpl(input, init);

    if (first.status !== 402) {
      const record: TransactionRecord = {
        id: randomId("rec"),
        agent: options.agent,
        endpoint,
        amount: 0,
        timestamp: Date.now(),
        status: "success",
      };
      await emit(record);
      return { response: first, record };
    }

    const amount = parsePaymentRequired(first);

    try {
      assertWithinBudget(amount);
    } catch (err) {
      const record: TransactionRecord = {
        id: randomId("rec"),
        agent: options.agent,
        endpoint,
        amount,
        timestamp: Date.now(),
        status: "blocked",
        reason: err instanceof Error ? err.message : String(err),
      };
      await emit(record);
      throw err;
    }

    const paid = await fetchImpl(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "x-payment-authorization": `oversight/${options.agent}`,
      },
    });

    commitSpend(amount);

    const record: TransactionRecord = {
      id: randomId("rec"),
      agent: options.agent,
      endpoint,
      amount,
      txHash: paid.headers.get("x-tx-hash") ?? undefined,
      timestamp: Date.now(),
      status: paid.ok ? "success" : "error",
    };
    await emit(record);

    return { response: paid, record };
  }

  function snapshot() {
    const now = Date.now();
    rollWindow(ledger.hourWindow, HOUR_MS, now);
    rollWindow(ledger.dayWindow, DAY_MS, now);
    return {
      agent: options.agent,
      total: ledger.total,
      hourly: ledger.hourWindow.amount,
      daily: ledger.dayWindow.amount,
      budget,
    };
  }

  return {
    fetch: oversightFetch,
    snapshot,
  };
}

export type Oversight = ReturnType<typeof createOversight>;
