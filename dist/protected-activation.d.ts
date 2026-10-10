import type { GovernedActivationResult, GovernedActivationState, ProtectedPromotionOptions } from "./activation-model.js";
/** Read one pointer once, then validate its whole immutable historical state. */
export declare function readProtectedGovernedActivation(trustPath: string): Promise<GovernedActivationState | undefined>;
/** Internal governed dispatch for promoteMetamapGeneration; never invokes legacy promotion. */
export declare function promoteProtectedGovernedActivation(value: unknown, options: ProtectedPromotionOptions): Promise<GovernedActivationResult>;
//# sourceMappingURL=protected-activation.d.ts.map