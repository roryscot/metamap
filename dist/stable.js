import { createHash } from "node:crypto";
export function stableValue(value) {
    if (Array.isArray(value))
        return value.map(stableValue);
    if (typeof value !== "object" || value === null)
        return value;
    return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]));
}
export function stableJson(value, pretty = false) {
    return `${JSON.stringify(stableValue(value), null, pretty ? 2 : undefined)}\n`;
}
export function contentDigest(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function valueDigest(value) {
    return contentDigest(stableJson(value));
}
export function valuesEqual(left, right) {
    return stableJson(left) === stableJson(right);
}
//# sourceMappingURL=stable.js.map