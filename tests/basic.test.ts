import { describe, it, expect } from "vitest";
import { createLedgerAgent, BudgetExceededError } from "../src";

describe("createLedgerAgent", () => {
  it("returns a fetch wrapper", () => {
    const agent = createLedgerAgent({ agent: "test-agent" });
    expect(typeof agent.fetch).toBe("function");
  });

  it("exposes the agent id", () => {
    const agent = createLedgerAgent({ agent: "researcher-01" });
    expect(agent.id).toBe("researcher-01");
  });
});

describe("BudgetExceededError", () => {
  it("carries the limit that was breached", () => {
    const err = new BudgetExceededError("hourly", 25, 30);
    expect(err.limit).toBe("hourly");
    expect(err.cap).toBe(25);
    expect(err.attempted).toBe(30);
    expect(err.message).toMatch(/hourly/);
  });
});
