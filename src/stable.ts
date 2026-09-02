import { createHash } from "node:crypto";

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

export function stableJson(value: unknown, pretty = false): string {
  return `${JSON.stringify(stableValue(value), null, pretty ? 2 : undefined)}\n`;
}

export function contentDigest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function valueDigest(value: unknown): string {
  return contentDigest(stableJson(value));
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}
