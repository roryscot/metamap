import type { ContextExpression, EvaluationContext, InactiveMappingReason, MappingApplicability } from "./viability-model.js";
/** Parse an external JSON value into the portable flat context contract. */
export declare function parseEvaluationContext(value: unknown): EvaluationContext;
/** Evaluate the portable, deliberately small context expression language. */
export declare function evaluateContextExpression(expression: ContextExpression, context: Readonly<EvaluationContext>): boolean;
/** Keys whose values must exist for an expression to be evaluated safely. */
export declare function requiredContextKeys(expression: ContextExpression): Set<string>;
export declare function inactiveReason(applicability: MappingApplicability | undefined, context: Readonly<EvaluationContext>): InactiveMappingReason | undefined;
//# sourceMappingURL=context.d.ts.map