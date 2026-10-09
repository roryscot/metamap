export type OperationId = "urn:bindings:command:create-user";
export declare const bindingDigest: string;
export declare const bindings: Readonly<
  Record<
    OperationId,
    Readonly<{
      handler: (input: unknown) => unknown;
      input: (input: unknown) => unknown;
      endpoint: Readonly<{ id: string; method: string; path: string }>;
    }>
  >
>;
export declare function invoke(id: OperationId, input: unknown): unknown;
export declare function handleRequest(
  method: string,
  path: string,
  input: unknown,
): unknown;
