/**
 * M1 — Canonical JSON serializer.
 *
 * Produces deterministic output independent of object-key insertion order:
 *   - Recursively sorts object keys alphabetically
 *   - Preserves array element order
 *   - Supports string, number, boolean, null, arrays, plain objects
 *   - Rejects undefined, functions, symbols, Dates, class instances, etc.
 */

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };

/**
 * Serialize a value to canonical JSON.
 * Throws for any unsupported value type.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(toCanonical(value));
}

function toCanonical(value: unknown): JsonValue {
  if (value === null) return null;
  if (value === undefined) {
    throw new TypeError("canonical-json: undefined is not supported");
  }

  const t = typeof value;

  if (t === "string" || t === "number" || t === "boolean") {
    return value as JsonPrimitive;
  }

  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new TypeError(`canonical-json: ${t} is not supported`);
  }

  if (Array.isArray(value)) {
    return value.map(toCanonical);
  }

  if (t === "object") {
    // Reject class instances (Date, Map, Set, etc.)
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        `canonical-json: class instance (${
          (value as object).constructor?.name ?? "unknown"
        }) is not supported`
      );
    }

    const obj = value as Record<string, unknown>;
    const sorted: JsonObject = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = toCanonical(obj[key]);
    }
    return sorted;
  }

  throw new TypeError(`canonical-json: unsupported value type ${t}`);
}
