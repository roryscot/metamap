import { CORE_RELATION_PACK_ID, CORE_RELATION_PACK_VERSION, } from "./model.js";
import { parseRelationPack, relationPackDigest } from "./relation-pack.js";
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
    laws = new Map();
    constructor(packs = [coreRelationPack]) {
        for (const pack of packs) {
            this.registerPack(pack);
        }
    }
    registerPack(pack) {
        if (pack.schemaVersion === "2.0.0") {
            parseRelationPack(pack);
            this.validateExecutablePack(pack);
            pack = immutableCopy(pack);
        }
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
        const incomingIds = new Set();
        for (const relation of pack.relations) {
            if (this.definitions.has(relation.id) || incomingIds.has(relation.id)) {
                throw new Error(`Relation ${relation.id} is already registered`);
            }
            incomingIds.add(relation.id);
        }
        for (const relation of pack.relations) {
            this.definitions.set(relation.id, relation);
        }
        this.packs.set(pack.id, pack);
        if (pack.schemaVersion === "2.0.0") {
            for (const law of pack.laws)
                this.laws.set(law.id, { packId: pack.id, law });
        }
    }
    validateExecutablePack(pack, validated = new Set()) {
        if (validated.has(pack.id))
            return;
        validated.add(pack.id);
        const imported = new Map();
        const importIds = new Set();
        for (const reference of pack.imports ?? []) {
            if (importIds.has(reference.id) || reference.id === pack.id)
                throw new Error(`Duplicate or self-imported pack ${reference.id}`);
            importIds.add(reference.id);
            const dependency = this.packs.get(reference.id);
            if (!dependency ||
                dependency.version !== reference.version ||
                relationPackDigest(dependency) !== reference.digest)
                throw new Error(`Missing exact imported pack ${reference.id}@${reference.version}`);
            parseRelationPack(dependency);
            if (dependency.schemaVersion === "2.0.0")
                this.validateExecutablePack(dependency, validated);
            for (const definition of dependency.relations)
                imported.set(definition.id, definition);
        }
        const definitions = new Map(imported);
        const owned = new Set();
        for (const definition of pack.relations) {
            if (definitions.has(definition.id) || owned.has(definition.id))
                throw new Error(`Duplicate relation ${definition.id} in ${pack.id}`);
            owned.add(definition.id);
            definitions.set(definition.id, definition);
        }
        const ruleIds = new Set();
        const kindsCompatible = (...sets) => {
            const restricted = sets.filter((set) => set !== undefined);
            return (restricted.length === 0 ||
                restricted[0].some((kind) => restricted.every((set) => set.includes(kind))));
        };
        for (const law of pack.laws) {
            const existing = this.laws.get(law.id);
            if (ruleIds.has(law.id) || (existing && existing.packId !== pack.id))
                throw new Error(`Duplicate law ${law.id}`);
            ruleIds.add(law.id);
            const operands = law.operands.map((id) => definitions.get(id));
            const result = definitions.get(law.resultRelation);
            if (!result || operands.some((definition) => !definition))
                throw new Error(`Law ${law.id} references a relation outside its pack or exact imports`);
            const first = operands[0];
            if (law.operation === "reverse") {
                if (!kindsCompatible(first.targetKinds, result.sourceKinds, law.conditions?.sourceKinds) ||
                    !kindsCompatible(first.sourceKinds, result.targetKinds, law.conditions?.targetKinds))
                    throw new Error(`Law ${law.id} has incompatible reverse endpoint kinds`);
                if (first.inverse && first.inverse !== result.id)
                    throw new Error(`Law ${law.id} contradicts inverse ${first.inverse}`);
                if (first.id === result.id && first.symmetric === false)
                    throw new Error(`Law ${law.id} contradicts declared non-symmetry`);
            }
            else {
                const second = operands[1];
                if (!kindsCompatible(first.targetKinds, second.sourceKinds, law.conditions?.middleKinds) ||
                    !kindsCompatible(first.sourceKinds, result.sourceKinds, law.conditions?.sourceKinds) ||
                    !kindsCompatible(second.targetKinds, result.targetKinds, law.conditions?.targetKinds))
                    throw new Error(`Law ${law.id} has incompatible chain endpoint kinds`);
                if (first.id === second.id &&
                    result.id === first.id &&
                    first.transitive === false)
                    throw new Error(`Law ${law.id} contradicts declared non-transitivity`);
            }
        }
        for (const definition of pack.relations) {
            const unconditional = (law) => !law.conditions || Object.keys(law.conditions).length === 0;
            const reverse = (result) => pack.laws.some((law) => unconditional(law) &&
                law.operation === "reverse" &&
                law.operands[0] === definition.id &&
                law.resultRelation === result);
            if (definition.symmetric && !reverse(definition.id))
                throw new Error(`Symmetric relation ${definition.id} needs an executable reverse law`);
            if (definition.transitive &&
                !pack.laws.some((law) => unconditional(law) &&
                    law.operation === "chain" &&
                    law.operands[0] === definition.id &&
                    law.operands[1] === definition.id &&
                    law.resultRelation === definition.id))
                throw new Error(`Transitive relation ${definition.id} needs an executable chain law`);
            if (definition.inverse &&
                (!definitions.has(definition.inverse) || !reverse(definition.inverse)))
                throw new Error(`Inverse relation ${definition.id} needs a referenced inverse and executable law`);
            for (const other of definition.composesWith ?? [])
                if (!pack.laws.some((law) => law.operation === "chain" &&
                    law.operands[0] === definition.id &&
                    law.operands[1] === other))
                    throw new Error(`Relation ${definition.id} needs an executable chain with ${other}`);
            for (const other of definition.disjointWith ?? [])
                if (!definitions.has(other) || other === definition.id)
                    throw new Error(`Invalid disjoint relation ${other} for ${definition.id}`);
        }
    }
    getPack(id) {
        return this.packs.get(id);
    }
    getLaw(id) {
        const entry = this.laws.get(id);
        if (!entry)
            return undefined;
        const pack = this.packs.get(entry.packId);
        // Legacy pack objects retain legacy mutability; executable imports cannot drift.
        this.validateExecutablePack(pack);
        return { pack, law: entry.law };
    }
    executablePacks() {
        return [...this.packs.values()].filter((pack) => pack.schemaVersion === "2.0.0");
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
function immutableCopy(value) {
    const copy = JSON.parse(JSON.stringify(value));
    const freeze = (item) => {
        if (typeof item !== "object" || item === null)
            return;
        for (const child of Object.values(item))
            freeze(child);
        Object.freeze(item);
    };
    freeze(copy);
    return copy;
}
//# sourceMappingURL=relations.js.map