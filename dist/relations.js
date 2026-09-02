import { CORE_RELATION_PACK_ID, CORE_RELATION_PACK_VERSION, } from "./model.js";
export const coreRelationPack = {
    schemaVersion: "1.0.0",
    id: CORE_RELATION_PACK_ID,
    version: CORE_RELATION_PACK_VERSION,
    description: "Minimal structural relations shared by language and domain adapters.",
    relations: [
        {
            id: "core:contains",
            cyclePolicy: "forbid",
            transitive: true,
            impactDirection: "both",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:implements",
            cyclePolicy: "forbid",
            impactDirection: "source-to-target",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:conforms_to",
            cyclePolicy: "forbid",
            impactDirection: "target-to-source",
            cardinalities: ["one-to-one", "many-to-one", "many-to-many"],
        },
        {
            id: "core:derives_from",
            cyclePolicy: "forbid",
            transitive: true,
            impactDirection: "target-to-source",
            cardinalities: [
                "one-to-one",
                "one-to-many",
                "many-to-one",
                "many-to-many",
            ],
        },
        {
            id: "core:generates",
            cyclePolicy: "forbid",
            impactDirection: "source-to-target",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:depends_on",
            cyclePolicy: "forbid",
            transitive: true,
            impactDirection: "target-to-source",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:mirrors",
            cyclePolicy: "allow",
            symmetric: true,
            impactDirection: "both",
            cardinalities: ["one-to-one", "many-to-many"],
        },
        {
            id: "core:documents",
            cyclePolicy: "allow",
            impactDirection: "target-to-source",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:tests",
            cyclePolicy: "allow",
            impactDirection: "target-to-source",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:exposes",
            cyclePolicy: "forbid",
            impactDirection: "both",
            cardinalities: ["one-to-one", "one-to-many", "many-to-many"],
        },
        {
            id: "core:references",
            cyclePolicy: "allow",
            impactDirection: "target-to-source",
            cardinalities: [
                "one-to-one",
                "one-to-many",
                "many-to-one",
                "many-to-many",
            ],
        },
        {
            id: "core:specified_by",
            cyclePolicy: "forbid",
            impactDirection: "target-to-source",
            cardinalities: ["one-to-one", "many-to-one", "many-to-many"],
        },
    ],
};
export class RelationRegistry {
    definitions = new Map();
    packs = new Map();
    constructor(packs = [coreRelationPack]) {
        for (const pack of packs) {
            this.registerPack(pack);
        }
    }
    registerPack(pack) {
        const existing = this.packs.get(pack.id);
        if (existing && existing.version !== pack.version) {
            throw new Error(`Relation pack ${pack.id} is already registered at version ${existing.version}`);
        }
        if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(pack)) {
                throw new Error(`Relation pack ${pack.id}@${pack.version} conflicts with its registered definition`);
            }
            return;
        }
        for (const relation of pack.relations) {
            if (this.definitions.has(relation.id)) {
                throw new Error(`Relation ${relation.id} is already registered`);
            }
            this.definitions.set(relation.id, relation);
        }
        this.packs.set(pack.id, pack);
    }
    get(id) {
        return this.definitions.get(id);
    }
    hasPack(id, version) {
        const registered = this.packs.get(id);
        return version ? registered?.version === version : registered !== undefined;
    }
    all() {
        return [...this.definitions.values()];
    }
    allPacks() {
        return [...this.packs.values()];
    }
}
//# sourceMappingURL=relations.js.map