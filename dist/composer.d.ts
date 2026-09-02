import { type MetamapDocument } from "./model.js";
export declare class MetamapCompositionError extends Error {
    readonly identifier?: string | undefined;
    constructor(message: string, identifier?: string | undefined);
}
export interface CompositionOptions {
    id: string;
    namespace: string;
    label?: string;
    revision?: string;
}
/**
 * Compose independently emitted graph shards. Cross-shard references are
 * resolved when the resulting document is passed to MetamapGraph.
 */
export declare function composeMetamapDocuments(documents: readonly MetamapDocument[], options: CompositionOptions): MetamapDocument;
//# sourceMappingURL=composer.d.ts.map