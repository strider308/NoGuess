import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  money,
  add,
  subtract,
  compare,
  lte,
  gt,
  format,
} from "../../src/lib/money.js";

describe("money()", () => {
  it("creates a Money value", () => {
    const m = money(1_000_000, "INR");
    assert.equal(m.amount, 1_000_000);
    assert.equal(m.currency, "INR");
  });

  it("throws for negative amounts", () => {
    assert.throws(() => money(-1, "INR"), /must be >= 0/);
  });

  it("throws for non-integer amounts", () => {
    assert.throws(() => money(1.5, "INR"), /must be an integer/);
  });

  it("allows zero", () => {
    assert.equal(money(0, "INR").amount, 0);
  });
});

describe("add()", () => {
  it("adds two same-currency values", () => {
    const result = add(money(1_000, "INR"), money(500, "INR"));
    assert.equal(result.amount, 1_500);
    assert.equal(result.currency, "INR");
  });

  it("throws on currency mismatch", () => {
    assert.throws(
      () => add(money(1_000, "INR"), money(500, "USD")),
      /currency mismatch/
    );
  });
});

describe("subtract()", () => {
  it("subtracts two same-currency values", () => {
    const result = subtract(money(1_000, "INR"), money(300, "INR"));
    assert.equal(result.amount, 700);
  });

  it("throws when result would be negative", () => {
    assert.throws(
      () => subtract(money(100, "INR"), money(200, "INR")),
      /would be negative/
    );
  });

  it("allows subtraction resulting in zero", () => {
    const result = subtract(money(500, "INR"), money(500, "INR"));
    assert.equal(result.amount, 0);
  });
});

describe("compare()", () => {
  it("returns -1 when a < b", () => {
    assert.equal(compare(money(100, "INR"), money(200, "INR")), -1);
  });

  it("returns 0 when a === b", () => {
    assert.equal(compare(money(100, "INR"), money(100, "INR")), 0);
  });

  it("returns 1 when a > b", () => {
    assert.equal(compare(money(300, "INR"), money(200, "INR")), 1);
  });
});

describe("lte() / gt()", () => {
  it("lte: at threshold", () => {
    assert.ok(lte(money(1_000_000, "INR"), money(1_000_000, "INR")));
  });

  it("lte: below threshold", () => {
    assert.ok(lte(money(999_999, "INR"), money(1_000_000, "INR")));
  });

  it("lte: above threshold is false", () => {
    assert.ok(!lte(money(1_000_001, "INR"), money(1_000_000, "INR")));
  });

  it("gt: above threshold", () => {
    assert.ok(gt(money(1_000_001, "INR"), money(1_000_000, "INR")));
  });
});

describe("format()", () => {
  it("formats a Money value as a readable string", () => {
    assert.equal(format(money(1_000_000, "INR")), "INR 1000000");
  });
});
