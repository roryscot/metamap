export declare function isReferenceIdentifier(value: unknown): value is string;
export declare function isRelationIdentifier(value: unknown): value is string;
export declare function makeUrn(namespace: string, kind: string, value: string): string;
/** Convert a repository-relative path or glob into a resolvable locator URI. */
export declare function makeRepositoryUri(rawPath: string, repository?: string): string;
export declare function hasAmbiguousPathLanguage(path: string): boolean;
export declare function isPathPattern(path: string): boolean;
//# sourceMappingURL=references.d.ts.map