import type { JsonValue } from "./model.js";
import { contentDigest } from "./stable.js";

export class CanonicalJsonError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

function fail(code: string, message: string): never {
  throw new CanonicalJsonError(code, message);
}

function unicode(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        fail("INVALID_JSON_UNICODE", "Unpaired high surrogate");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("INVALID_JSON_UNICODE", "Unpaired low surrogate");
    }
  }
}

/** RFC 8785: ECMAScript primitives, UTF-16 key order, no whitespace/newline. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (item: unknown, depth: number): string => {
    if (depth > 512)
      fail("JSON_DEPTH_LIMIT", "Canonical JSON exceeds 512 levels");
    if (item === null) return "null";
    if (typeof item === "string") {
      unicode(item);
      return JSON.stringify(item);
    }
    if (typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item))
        fail(
          "INVALID_JSON_VALUE",
          "JSON numbers must be finite IEEE-754 values",
        );
      return JSON.stringify(item);
    }
    if (typeof item !== "object")
      fail("INVALID_JSON_VALUE", "Expected JSON-compatible values");
    if (ancestors.has(item)) fail("INVALID_JSON_VALUE", "Cyclic JSON value");
    if (Object.getOwnPropertySymbols(item).length !== 0)
      fail("INVALID_JSON_VALUE", "Symbol properties are not JSON");
    const descriptors = Object.getOwnPropertyDescriptors(item);
    for (const descriptor of Object.values(descriptors)) {
      if (!Object.hasOwn(descriptor, "value"))
        fail("INVALID_JSON_VALUE", "Accessors are not JSON values");
    }
    ancestors.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (Object.getOwnPropertyNames(item).length !== item.length + 1)
        fail(
          "INVALID_JSON_VALUE",
          "Sparse arrays and extra array properties are not JSON",
        );
      const elements: string[] = [];
      for (let index = 0; index < item.length; index++) {
        if (!Object.hasOwn(item, index))
          fail("INVALID_JSON_VALUE", "Sparse arrays are not JSON");
        elements.push(encode(descriptors[index].value, depth + 1));
      }
      result = `[${elements.join(",")}]`;
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null)
        fail("INVALID_JSON_VALUE", "Expected a plain JSON object");
      const keys = Object.keys(descriptors).sort();
      const fields = keys.map((key) => {
        unicode(key);
        if (!descriptors[key].enumerable)
          fail(
            "INVALID_JSON_VALUE",
            "Nonenumerable object fields are not JSON",
          );
        return `${JSON.stringify(key)}:${encode(descriptors[key].value, depth + 1)}`;
      });
      result = `{${fields.join(",")}}`;
    }
    ancestors.delete(item);
    return result;
  };
  return encode(value, 0);
}

export function canonicalDigest(value: unknown): string {
  return contentDigest(canonicalJson(value));
}

/** Materialize an existing legacy JSON reference without running getters.
 * Legacy value digests omit undefined object fields; new documents reject them.
 */
export function legacyReferenceValue(value: unknown): JsonValue {
  const ancestors = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (depth > 512)
      fail("JSON_DEPTH_LIMIT", "Legacy reference exceeds 512 levels");
    if (typeof item !== "object" || item === null) return item;
    if (ancestors.has(item))
      fail("INVALID_JSON_VALUE", "Cyclic legacy reference");
    if (Object.getOwnPropertySymbols(item).length)
      fail("INVALID_JSON_VALUE", "Symbol properties are not JSON");
    const prototype = Object.getPrototypeOf(item);
    if (
      !Array.isArray(item) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      fail("INVALID_JSON_VALUE", "Expected a plain legacy JSON object");
    const descriptors = Object.getOwnPropertyDescriptors(item);
    for (const descriptor of Object.values(descriptors))
      if (!Object.hasOwn(descriptor, "value"))
        fail("INVALID_JSON_VALUE", "Accessors are not JSON values");
    ancestors.add(item);
    let result: unknown;
    if (Array.isArray(item)) {
      if (Object.getOwnPropertyNames(item).length !== item.length + 1)
        fail(
          "INVALID_JSON_VALUE",
          "Sparse arrays and extra properties are not JSON",
        );
      result = Array.from({ length: item.length }, (_, index) => {
        if (!Object.hasOwn(item, index))
          fail("INVALID_JSON_VALUE", "Sparse arrays are not JSON");
        return copy(descriptors[index].value, depth + 1);
      });
    } else {
      const object = Object.create(null) as Record<string, unknown>;
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (!descriptor.enumerable)
          fail("INVALID_JSON_VALUE", "Nonenumerable properties are not JSON");
        if (descriptor.value !== undefined)
          object[key] = copy(descriptor.value, depth + 1);
      }
      result = object;
    }
    ancestors.delete(item);
    return result;
  };
  return JSON.parse(canonicalJson(copy(value, 0))) as JsonValue;
}

/** Detect decoded duplicate keys before returning any untrusted parsed object. */
export function parseStrictJson(text: string): JsonValue {
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    return fail("INVALID_JSON_SYNTAX", "Invalid JSON syntax");
  }
  let offset = 0;
  const whitespace = (): void => {
    while (/[\t\n\r ]/.test(text[offset] ?? "")) offset++;
  };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === "\\") offset++;
      else if (character === '"')
        return JSON.parse(text.slice(start, offset)) as string;
    }
    return fail("INVALID_JSON_SYNTAX", "Unterminated string");
  };
  const scan = (depth: number): void => {
    if (depth > 512) fail("JSON_DEPTH_LIMIT", "JSON input exceeds 512 levels");
    whitespace();
    const token = text[offset];
    if (token === '"') {
      string();
      return;
    }
    if (token === "{") {
      offset++;
      whitespace();
      const keys = new Set<string>();
      while (text[offset] !== "}") {
        const key = string();
        if (keys.has(key))
          fail(
            "DUPLICATE_JSON_KEY",
            `Duplicate JSON property ${JSON.stringify(key)}`,
          );
        keys.add(key);
        whitespace();
        offset++;
        scan(depth + 1);
        whitespace();
        if (text[offset] === ",") {
          offset++;
          whitespace();
        } else break;
      }
      offset++;
    } else if (token === "[") {
      offset++;
      whitespace();
      while (text[offset] !== "]") {
        scan(depth + 1);
        whitespace();
        if (text[offset] === ",") {
          offset++;
          whitespace();
        } else break;
      }
      offset++;
    } else {
      while (offset < text.length && !/[\t\n\r ,}\]]/.test(text[offset]))
        offset++;
    }
  };
  scan(0);
  canonicalJson(value);
  return value;
}
