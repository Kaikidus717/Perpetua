import { describe, expect, it } from "vitest";
import {
  customerError,
  customerLoadError,
  customerValidationError,
} from "../src/customerErrors.js";

const RAW = `{"jsonrpc":"2.0","error":{"code":410,"message":"closed"},"id":"1"}`;

function expectClean(message: string): void {
  expect(message).not.toMatch(/jsonrpc|custom program error|error number|0x[0-9a-f]/i);
  expect(message).not.toContain("{");
  expect(message).not.toContain("[");
}

describe("customerError", () => {
  it("turns program errors into a sentence", () => {
    const message = customerError("custom program error: 0x1775", {
      action: "collect your fees",
    });
    expect(message).toBe(
      "No fees are ready to collect. First collect the pool's fees, then collect yours.",
    );
    expectClean(message);
  });

  it("handles a declined wallet request", () => {
    expect(customerError(new Error("User rejected the request."), { action: "stake" })).toBe(
      "You declined the request. Nothing was sent.",
    );
  });

  it("handles a network failure", () => {
    expect(customerError(new Error("fetch failed"), { action: "stake" })).toBe(
      "We couldn't reach Perpetua. Check your connection and try again.",
    );
  });

  it("never leaks raw JSON for an unknown failure", () => {
    const message = customerError(RAW, { action: "turn this position into shares" });
    expect(message).toBe(
      "We couldn't turn this position into shares. Try again. If your wallet shows a pending transaction, check it before sending again.",
    );
    expectClean(message);
  });

  it("keeps an already customer-safe API sentence", () => {
    const sentence = "This wallet has fewer shares than that. Enter a smaller amount.";
    expect(customerError(sentence, { action: "stake" })).toBe(sentence);
  });
});

describe("customerLoadError", () => {
  it("does not expose a transport error", () => {
    const message = customerLoadError("data api /pools/x failed with 500", "this pool");
    expect(message).toBe("Meteora's fee data service isn't responding. Try again in a moment.");
    expectClean(message);
  });

  it("separates not found from an outage", () => {
    expect(customerLoadError("404 not found", "that vault")).toBe("We couldn't find that vault.");
  });

  it("keeps a test-network explanation instead of calling it a connection failure", () => {
    const sentence =
      "Meteora's fee data service has no history for that pool. It may be a test-network pool. Pricing covers mainnet pools.";
    expect(customerLoadError(sentence, "this pool")).toBe(sentence);
  });
});

describe("customerValidationError", () => {
  it("names the first field without parser language", () => {
    expect(customerValidationError(["amount"])).toBe("Check the amount value and try again.");
    expect(customerValidationError()).toBe("Check the values in this request and try again.");
  });
});
