function isPrimitive(value) {
    return (value === null ||
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string");
}
/** Parse an external JSON value into the portable flat context contract. */
export function parseEvaluationContext(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Evaluation context must be an object");
    }
    const context = {};
    for (const [key, entry] of Object.entries(value)) {
        if (key.length === 0)
            throw new Error("Evaluation context keys cannot be empty");
        if (!isPrimitive(entry) &&
            (!Array.isArray(entry) || !entry.every(isPrimitive))) {
            throw new Error(`Evaluation context ${key} must be a JSON primitive or primitive array`);
        }
        context[key] = entry;
    }
    return context;
}
function valuesEqual(left, right) {
    return Object.is(left, right);
}
function includesValue(container, expected) {
    return Array.isArray(container)
        ? container.some((entry) => valuesEqual(entry, expected))
        : valuesEqual(container, expected);
}
/** Evaluate the portable, deliberately small context expression language. */
export function evaluateContextExpression(expression, context) {
    if ("all" in expression) {
        return expression.all.every((child) => evaluateContextExpression(child, context));
    }
    if ("any" in expression) {
        return expression.any.some((child) => evaluateContextExpression(child, context));
    }
    if ("not" in expression) {
        return !evaluateContextExpression(expression.not, context);
    }
    const present = Object.hasOwn(context, expression.key);
    if (expression.operator === "exists") {
        return expression.value === false ? !present : present;
    }
    if (!present)
        return false;
    const actual = context[expression.key];
    if (expression.operator === "equals") {
        return includesValue(actual, expression.value);
    }
    if (expression.operator === "not-equals") {
        return !includesValue(actual, expression.value);
    }
    if (expression.operator === "in" && "values" in expression) {
        const actualValues = Array.isArray(actual) ? actual : [actual];
        return actualValues.some((entry) => expression.values.some((expected) => valuesEqual(entry, expected)));
    }
    if (!("values" in expression))
        return false;
    const actualValues = Array.isArray(actual) ? actual : [actual];
    return actualValues.every((entry) => expression.values.every((expected) => !valuesEqual(entry, expected)));
}
/** Keys whose values must exist for an expression to be evaluated safely. */
export function requiredContextKeys(expression) {
    if ("all" in expression) {
        return new Set(expression.all.flatMap((child) => [...requiredContextKeys(child)]));
    }
    if ("any" in expression) {
        return new Set(expression.any.flatMap((child) => [...requiredContextKeys(child)]));
    }
    if ("not" in expression)
        return requiredContextKeys(expression.not);
    return expression.operator === "exists"
        ? new Set()
        : new Set([expression.key]);
}
export function inactiveReason(applicability, context) {
    if (applicability?.when &&
        !evaluateContextExpression(applicability.when, context)) {
        return "when-not-satisfied";
    }
    if (applicability?.unless &&
        evaluateContextExpression(applicability.unless, context)) {
        return "inhibited";
    }
    return undefined;
}
//# sourceMappingURL=context.js.map