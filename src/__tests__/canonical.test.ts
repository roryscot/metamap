import { describe, expect, it } from "vitest";
import {
  canonicalDigest,
  canonicalJson,
  legacyReferenceValue,
  parseStrictJson,
} from "../canonical.js";
import { contentDigest, stableJson } from "../stable.js";

describe("RFC 8785 canonical values", () => {
  it("materializes only legacy optional fields without executing getters or accepting undefined in new values", () => {
    const legacy = {
      id: "urn:example",
      label: undefined,
      attributes: { value: -0 },
    };
    const materialized = legacyReferenceValue(legacy);
    expect(materialized).toEqual({
      id: "urn:example",
      attributes: { value: 0 },
    });
    expect(contentDigest(stableJson(materialized))).toBe(
      contentDigest(stableJson(legacy)),
    );
    expect(() => canonicalJson(legacy)).toThrow();
    let invoked = false;
    const getter = Object.defineProperty({}, "id", {
      enumerable: true,
      get() {
        invoked = true;
        return "urn:x";
      },
    });
    expect(() => legacyReferenceValue(getter)).toThrow(/Accessors/);
    expect(invoked).toBe(false);
    expect(() => legacyReferenceValue([undefined])).toThrow();
  });
  it("uses the normative UTF-16 property order, preserving array order and Unicode", () => {
    const value = {
      "\u20ac": 1,
      "\r": 2,
      "\ufb33": 3,
      "1": 4,
      "\ud83d\ude00": 5,
      "\u0080": 6,
      "\u00f6": 7,
      a: [3, 2, 1],
    };
    expect(canonicalJson(value)).toBe(
      '{"\\r":2,"1":4,"a":[3,2,1],"\u0080":6,"ö":7,"€":1,"😀":5,"דּ":3}',
    );
    expect(canonicalJson({ value: "e\u0301" })).not.toBe(
      canonicalJson({ value: "é" }),
    );
  });

  it("serializes the RFC numerical examples with ECMAScript rounding and negative zero", () => {
    expect(
      canonicalJson([333333333.33333329, 1e30, 4.5, 2e-3, 1e-27, -0]),
    ).toBe("[333333333.3333333,1e+30,4.5,0.002,1e-27,0]");
    const samples: Array<[string, string]> = [
      ["0000000000000001", "5e-324"],
      ["8000000000000001", "-5e-324"],
      ["7fefffffffffffff", "1.7976931348623157e+308"],
      ["ffefffffffffffff", "-1.7976931348623157e+308"],
      ["4340000000000000", "9007199254740992"],
      ["4430000000000000", "295147905179352830000"],
      ["44b52d02c7e14af5", "9.999999999999997e+22"],
      ["44b52d02c7e14af6", "1e+23"],
      ["44b52d02c7e14af7", "1.0000000000000001e+23"],
      ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
      ["3eb0c6f7a0b5ed8d", "0.000001"],
    ];
    for (const [bytes, expected] of samples)
      expect(canonicalJson(Buffer.from(bytes, "hex").readDoubleBE())).toBe(
        expected,
      );
  });

  it("hashes UTF-8 canonical bytes without altering the legacy convention", () => {
    const value = { z: "😀", a: 1 };
    expect(canonicalDigest(value)).toBe(contentDigest('{"a":1,"z":"😀"}'));
    expect(stableJson(value)).toBe('{"a":1,"z":"😀"}\n');
    expect(canonicalDigest(value)).not.toBe(contentDigest(stableJson(value)));
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
    undefined,
    1n,
    new Date(0),
    { a: undefined },
    [, 1],
    { value: "\ud800" },
    { "\udfff": 1 },
  ])("rejects a non-I-JSON value: %s", (value) => {
    expect(() => canonicalJson(value)).toThrow();
  });

  it("rejects cycles and accessors without evaluating them", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow("Cyclic");
    let executed = false;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        executed = true;
        return 1;
      },
    });
    expect(() => canonicalJson(accessor)).toThrow("Accessors");
    expect(executed).toBe(false);
  });

  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"nested":{"x":1,"x":2}}',
    '[{"x":1,"x":2}]',
  ])("rejects decoded duplicate keys before use: %s", (text) => {
    expect(() => parseStrictJson(text)).toThrow("Duplicate JSON property");
  });

  it("retains prototype-like keys as ordinary JSON data and bounds nesting", () => {
    const value = parseStrictJson('{"__proto__":{"admin":true},"x":"\\\""}');
    expect(canonicalJson(value)).toBe(
      '{"__proto__":{"admin":true},"x":"\\\""}',
    );
    expect(Object.hasOwn(value as object, "__proto__")).toBe(true);
    expect(() =>
      parseStrictJson("[".repeat(514) + "0" + "]".repeat(514)),
    ).toThrow("512");
    expect(() => parseStrictJson('{"x":1e999}')).toThrow("finite");
    expect(() => parseStrictJson('{"x":1,}')).toThrow("Invalid JSON syntax");
  });
});
