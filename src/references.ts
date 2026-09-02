const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;
const RELATION_PATTERN = /^[a-z][a-z0-9._-]*:[a-z][a-z0-9._-]*$/;

export function isReferenceIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

export function isRelationIdentifier(value: unknown): value is string {
  return typeof value === "string" && RELATION_PATTERN.test(value);
}

export function makeUrn(
  namespace: string,
  kind: string,
  value: string,
): string {
  const encoded = encodeURIComponent(value);
  return `urn:${namespace}:${kind}:${encoded}`;
}

/** Convert a repository-relative path or glob into a resolvable locator URI. */
export function makeRepositoryUri(
  rawPath: string,
  repository = "workspace",
): string {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\.\//, "");
  const encodedPath = normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `repo://${encodeURIComponent(repository)}/${encodedPath}`;
}

export function hasAmbiguousPathLanguage(path: string): boolean {
  return /\s+or\s+/i.test(path);
}

export function isPathPattern(path: string): boolean {
  return /[*?{}[\]]/.test(path);
}
