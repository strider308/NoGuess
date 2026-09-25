import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";

describe("FakeClock", () => {
  it("starts at the given epoch", () => {
    const clock = new FakeClock(1_000_000);
    assert.equal(clock.now(), 1_000_000);
  });

  it("advances by milliseconds", () => {
    const clock = new FakeClock(0);
    clock.advanceMs(500);
    assert.equal(clock.now(), 500);
  });

  it("advances by seconds", () => {
    const clock = new FakeClock(0);
    clock.advanceSeconds(10);
    assert.equal(clock.now(), 10_000);
  });

  it("advances by days", () => {
    const clock = new FakeClock(0);
    clock.advanceDays(1);
    assert.equal(clock.now(), 86_400_000);
  });

  it("accumulates advances", () => {
    const clock = new FakeClock(0);
    clock.advanceSeconds(30);
    clock.advanceSeconds(30);
    assert.equal(clock.now(), 60_000);
  });

  it("allows setNow to jump to an exact time", () => {
    const clock = new FakeClock(0);
    clock.setNow(9_999_999);
    assert.equal(clock.now(), 9_999_999);
  });

  it("throws when trying to go backwards via advanceMs", () => {
    const clock = new FakeClock(1_000);
    assert.throws(() => clock.advanceMs(-1), /cannot go backwards/);
  });

  it("uses the default start epoch when none provided", () => {
    const clock = new FakeClock();
    assert.equal(clock.now(), 1_700_000_000_000);
  });
});
