import {
  type AuthorityDeclaration,
  type AuthorityResolution,
  type MetamapDocument,
  type MetamapEntity,
  type StructuralMapping,
  type TraversalDirection,
  type TraversalOptions,
  type TraversalVisit,
  type ValidationIssue,
} from "./model.js";
import { RelationRegistry } from "./relations.js";
import { validateMetamapDocument } from "./validator.js";

export class MetamapValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `Metamap validation failed with ${issues.filter((entry) => entry.severity === "error").length} error(s)`,
    );
    this.name = "MetamapValidationError";
  }
}

export interface MetamapGraphOptions {
  registry?: RelationRegistry;
  validate?: boolean;
}

/** Indexed, immutable query view over a language-neutral metamap document. */
export class MetamapGraph {
  readonly document: MetamapDocument;
  readonly registry: RelationRegistry;
  readonly validationIssues: ValidationIssue[];

  private readonly entitiesById = new Map<string, MetamapEntity>();
  private readonly mappingsById = new Map<string, StructuralMapping>();
  private readonly mappingsByEntity = new Map<string, StructuralMapping[]>();
  private readonly authoritiesByConcept = new Map<
    string,
    AuthorityDeclaration[]
  >();
  private readonly delegationsByParent = new Map<
    string,
    AuthorityDeclaration[]
  >();

  constructor(document: MetamapDocument, options: MetamapGraphOptions = {}) {
    this.document = document;
    this.registry = options.registry ?? new RelationRegistry();

    const validation = validateMetamapDocument(document, this.registry);
    this.validationIssues = validation.issues;
    if (options.validate !== false && !validation.valid) {
      throw new MetamapValidationError(validation.issues);
    }

    for (const entity of document.entities) {
      this.entitiesById.set(entity.id, entity);
    }
    for (const mapping of document.mappings) {
      this.mappingsById.set(mapping.id, mapping);
      for (const entityId of new Set([
        ...mapping.sources,
        ...mapping.targets,
      ])) {
        const indexed = this.mappingsByEntity.get(entityId) ?? [];
        indexed.push(mapping);
        this.mappingsByEntity.set(entityId, indexed);
      }
    }
    for (const authority of document.authorities) {
      const indexed = this.authoritiesByConcept.get(authority.concept) ?? [];
      indexed.push(authority);
      this.authoritiesByConcept.set(authority.concept, indexed);
      if (authority.mode === "delegated") {
        const children =
          this.delegationsByParent.get(authority.delegatedFrom) ?? [];
        children.push(authority);
        this.delegationsByParent.set(authority.delegatedFrom, children);
      }
    }
  }

  static from(value: unknown, options: MetamapGraphOptions = {}): MetamapGraph {
    const registry = options.registry ?? new RelationRegistry();
    const validation = validateMetamapDocument(value, registry);
    if (!validation.valid) {
      throw new MetamapValidationError(validation.issues);
    }
    return new MetamapGraph(value as MetamapDocument, {
      ...options,
      registry,
      validate: false,
    });
  }

  getEntity(id: string): MetamapEntity | undefined {
    return this.entitiesById.get(id);
  }

  getMapping(id: string): StructuralMapping | undefined {
    return this.mappingsById.get(id);
  }

  mappingsFor(
    entityId: string,
    options: Pick<TraversalOptions, "direction" | "relations"> = {},
  ): StructuralMapping[] {
    const direction = options.direction ?? "both";
    const relationFilter = options.relations
      ? new Set(options.relations)
      : undefined;

    return (this.mappingsByEntity.get(entityId) ?? []).filter((mapping) => {
      if (relationFilter && !relationFilter.has(mapping.relation)) return false;
      const symmetric = this.registry.get(mapping.relation)?.symmetric === true;
      if (direction === "both" || symmetric) return true;
      if (direction === "outgoing") return mapping.sources.includes(entityId);
      return mapping.targets.includes(entityId);
    });
  }

  neighbors(
    entityId: string,
    options: Pick<TraversalOptions, "direction" | "relations"> = {},
  ): Array<{ entity: MetamapEntity; mapping: StructuralMapping }> {
    const direction = options.direction ?? "both";
    const results = new Map<
      string,
      { entity: MetamapEntity; mapping: StructuralMapping }
    >();

    for (const mapping of this.mappingsFor(entityId, options)) {
      for (const linkedId of this.linkedEntityIds(
        mapping,
        entityId,
        direction,
      )) {
        const entity = this.entitiesById.get(linkedId);
        if (entity) {
          results.set(`${mapping.id}\u0000${linkedId}`, { entity, mapping });
        }
      }
    }
    return [...results.values()];
  }

  trace(entityId: string, options: TraversalOptions = {}): TraversalVisit[] {
    const start = this.entitiesById.get(entityId);
    if (!start) return [];

    const maxDepth = options.maxDepth ?? 1;
    if (!Number.isInteger(maxDepth) || maxDepth < 0) {
      throw new Error("maxDepth must be a non-negative integer");
    }

    const visits: TraversalVisit[] = [{ entity: start, depth: 0 }];
    const visited = new Set([entityId]);
    const queue: Array<{ id: string; depth: number }> = [
      { id: entityId, depth: 0 },
    ];

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current.depth >= maxDepth) continue;
      for (const neighbor of this.neighbors(current.id, options)) {
        if (visited.has(neighbor.entity.id)) continue;
        visited.add(neighbor.entity.id);
        const depth = current.depth + 1;
        visits.push({
          entity: neighbor.entity,
          depth,
          viaMapping: neighbor.mapping,
          predecessor: current.id,
        });
        queue.push({ id: neighbor.entity.id, depth });
      }
    }
    return visits;
  }

  resolveAuthority(conceptId: string, fact: string): AuthorityResolution {
    const applies = (authority: AuthorityDeclaration): boolean =>
      authority.facts.includes("*") || authority.facts.includes(fact);
    const applicable = (this.authoritiesByConcept.get(conceptId) ?? []).filter(
      applies,
    );
    const canonical = applicable.filter(
      (authority) => authority.mode === "canonical",
    );
    const delegated = applicable.filter(
      (authority) => authority.mode === "delegated",
    );
    const candidates = applicable.filter(
      (authority) => authority.mode === "candidate",
    );

    if (canonical.length === 1) {
      const chain = [canonical[0]];
      const visited = new Set([canonical[0].id]);
      let current = canonical[0];
      while (true) {
        const children = (
          this.delegationsByParent.get(current.id) ?? []
        ).filter(applies);
        if (children.length === 0) {
          return {
            status: "resolved",
            canonical: canonical[0],
            effective: current,
            delegationChain: chain,
            candidates,
          };
        }
        if (children.length > 1 || visited.has(children[0].id)) {
          return {
            status: "ambiguous",
            candidates: [...canonical, ...delegated, ...candidates],
          };
        }
        current = children[0];
        visited.add(current.id);
        chain.push(current);
      }
    }
    if (canonical.length > 1 || delegated.length > 0 || candidates.length > 0) {
      return {
        status: "ambiguous",
        candidates: [...canonical, ...delegated, ...candidates],
      };
    }
    return { status: "unresolved", candidates: [] };
  }

  private linkedEntityIds(
    mapping: StructuralMapping,
    entityId: string,
    direction: TraversalDirection,
  ): Set<string> {
    const linked = new Set<string>();
    const symmetric = this.registry.get(mapping.relation)?.symmetric === true;
    const fromSource = mapping.sources.includes(entityId);
    const fromTarget = mapping.targets.includes(entityId);

    if ((direction !== "incoming" && fromSource) || (symmetric && fromSource)) {
      for (const target of mapping.targets) linked.add(target);
    }
    if ((direction !== "outgoing" && fromTarget) || (symmetric && fromTarget)) {
      for (const source of mapping.sources) linked.add(source);
    }
    linked.delete(entityId);
    return linked;
  }
}
