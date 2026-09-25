import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err, isOk, isErr, unwrap, map } from "../../src/lib/result.js";

describe("ok()", () => {
  it("creates a success result", () => {
    const r = ok(42);
    assert.equal(r.ok, true);
    assert.equal(r.value, 42);
  });

  it("isOk returns true for ok result", () => {
    assert.ok(isOk(ok("hello")));
  });

  it("isErr returns false for ok result", () => {
    assert.ok(!isErr(ok("hello")));
  });
});

describe("err()", () => {
  it("creates a failure result", () => {
    const r = err("something went wrong");
    assert.equal(r.ok, false);
    assert.equal(r.error, "something went wrong");
  });

  it("isErr returns true for err result", () => {
    assert.ok(isErr(err("oops")));
  });

  it("isOk returns false for err result", () => {
    assert.ok(!isOk(err("oops")));
  });
});

describe("unwrap()", () => {
  it("returns the value for an ok result", () => {
    assert.equal(unwrap(ok(99)), 99);
  });

  it("throws for an err result", () => {
    assert.throws(() => unwrap(err("fail")), /fail/);
  });
});

describe("map()", () => {
  it("transforms an ok value", () => {
    const r = map(ok(10), (v) => v * 2);
    assert.ok(isOk(r));
    assert.equal(r.value, 20);
  });

  it("passes err through unchanged", () => {
    const r = map(err("bad"), (v: number) => v * 2);
    assert.ok(isErr(r));
    assert.equal(r.error, "bad");
  });
});
