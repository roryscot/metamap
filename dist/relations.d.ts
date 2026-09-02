import { type RelationDefinition, type RelationPack } from "./model.js";
export declare const coreRelationPack: RelationPack;
export declare class RelationRegistry {
    private readonly definitions;
    private readonly packs;
    constructor(packs?: readonly RelationPack[]);
    registerPack(pack: RelationPack): void;
    get(id: string): RelationDefinition | undefined;
    hasPack(id: string, version?: string): boolean;
    all(): RelationDefinition[];
}
//# sourceMappingURL=relations.d.ts.map