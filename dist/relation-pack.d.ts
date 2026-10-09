import type { RelationPack } from "./model.js";
/** Strictly parse a portable relation-pack document. */
export declare function parseRelationPack(value: unknown): RelationPack;
/** A referenced legacy pack keeps its original digest convention. */
export declare function relationPackDigest(pack: RelationPack): string;
export declare function loadRelationPack(path: string): Promise<RelationPack>;
//# sourceMappingURL=relation-pack.d.ts.map