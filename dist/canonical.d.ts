import type { JsonValue } from "./model.js";
export declare class CanonicalJsonError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** RFC 8785: ECMAScript primitives, UTF-16 key order, no whitespace/newline. */
export declare function canonicalJson(value: unknown): string;
export declare function canonicalDigest(value: unknown): string;
/** Materialize an existing legacy JSON reference without running getters.
 * Legacy value digests omit undefined object fields; new documents reject them.
 */
export declare function legacyReferenceValue(value: unknown): JsonValue;
/** Detect decoded duplicate keys before returning any untrusted parsed object. */
export declare function parseStrictJson(text: string): JsonValue;
//# sourceMappingURL=canonical.d.ts.map