import type { NextjsAppRouterSourceConfig } from "../config.js";
import type { AdapterContext, AdapterInput, AdapterResult, MetamapAdapter } from "./types.js";
/**
 * Deterministically discovers the structural surface of a Next.js App Router.
 * It observes framework facts only; semantic route equivalence and context
 * requirements remain explicit overlays owned by the consuming application.
 */
export declare class NextjsAppRouterAdapter implements MetamapAdapter<NextjsAppRouterSourceConfig> {
    readonly id: "nextjs-app-router";
    readonly version = "1.1.0";
    fingerprint(config: NextjsAppRouterSourceConfig, context: AdapterContext): Promise<AdapterInput[]>;
    discover(config: NextjsAppRouterSourceConfig, context: AdapterContext): Promise<AdapterResult>;
}
export declare const nextjsAppRouterAdapterVersion = "1.1.0";
//# sourceMappingURL=nextjs-app-router.d.ts.map