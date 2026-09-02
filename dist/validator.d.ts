import { type MetamapDocument, type ValidationIssue, type ValidationResult } from "./model.js";
import { RelationRegistry } from "./relations.js";
/** Runtime shape validation for documents read from JSON or external adapters. */
export declare function validateDocumentShape(value: unknown): ValidationIssue[];
/** Semantic validation after the JSON document has passed shape validation. */
export declare function validateDocumentSemantics(document: MetamapDocument, registry?: RelationRegistry): ValidationIssue[];
export declare function validateMetamapDocument(value: unknown, registry?: RelationRegistry): ValidationResult;
//# sourceMappingURL=validator.d.ts.map