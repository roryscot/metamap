import { type RelationDefinition, type RelationPack, type ExecutableRelationPack, type RelationLaw } from "./model.js";
export declare const coreRelationPack: RelationPack;
export declare class RelationRegistry {
    private readonly definitions;
    private readonly packs;
    private readonly laws;
    constructor(packs?: readonly RelationPack[]);
    registerPack(pack: RelationPack): void;
    private validateExecutablePack;
    getPack(id: string): RelationPack | undefined;
    getLaw(id: string): {
        pack: ExecutableRelationPack;
        law: RelationLaw;
    } | undefined;
    executablePacks(): ExecutableRelationPack[];
    get(id: string): RelationDefinition | undefined;
    hasPack(id: string, version?: string): boolean;
    all(): RelationDefinition[];
    allPacks(): RelationPack[];
}
//# sourceMappingURL=relations.d.ts.map