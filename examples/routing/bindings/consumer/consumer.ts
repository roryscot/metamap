import { invoke, type OperationId } from "../generated/consumer.mjs";

const operation: OperationId = "urn:bindings:command:create-user";
invoke(operation, { name: "Ada" });

// The generated identity union rejects a handwritten, unbound operation.
// @ts-expect-error No such operation is declared by these sources.
invoke("urn:bindings:command:not-declared", {});
