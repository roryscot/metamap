export const METAMAP_SCHEMA_VERSION = "2.0.0" as const;
export const CORE_RELATION_PACK_ID = "urn:metamap:relation-pack:core" as const;
export const CORE_RELATION_PACK_VERSION = "1.0.0" as const;
export const APPLICATION_TOPOLOGY_RELATION_PACK_ID =
  "urn:metamap:relation-pack:application-topology" as const;
export const APPLICATION_TOPOLOGY_RELATION_PACK_VERSION = "1.0.0" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ProvenanceStatus =
  "declared" | "observed" | "generated" | "inferred";

export interface Provenance {
  status: ProvenanceStatus;
  assertedBy: string;
  observedAt?: string;
  sourceRevision?: string;
  confidence?: number;
}

export interface Locator {
  uri: string;
  mediaType?: string;
  revision?: string;
  digest?: string;
}

/**
 * A stable semantic identity in the graph. Physical paths and symbols are
 * locators so that a rename does not have to change the entity identity.
 */
export interface MetamapEntity {
  id: string;
  kind: string;
  label?: string;
  schema?: string;
  locators?: Locator[];
  attributes?: JsonObject;
  provenance?: Provenance;
}

export type MappingCardinality =
  "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export type MappingLossiness = "lossless" | "lossy" | "unknown";

export interface TransformReference {
  adapter: string;
  version: string;
  entrypoint?: string;
  deterministic?: boolean;
  reversible?: boolean;
  configuration?: JsonObject;
}

/**
 * A first-class, potentially n-ary correspondence between entities.
 * Relationship semantics come from a versioned relation pack.
 */
export interface StructuralMapping {
  id: string;
  relation: string;
  sources: string[];
  targets: string[];
  cardinality: MappingCardinality;
  lossiness: MappingLossiness;
  transform?: TransformReference;
  invariants?: string[];
  attributes?: JsonObject;
  provenance: Provenance;
}

export type AuthorityMode = "canonical" | "delegated" | "candidate";

interface AuthorityDeclarationBase {
  id: string;
  concept: string;
  source: string;
  facts: string[];
  provenance: Provenance;
}

/** Authority is scoped to facts, not entire files or structures. */
export type AuthorityDeclaration =
  | (AuthorityDeclarationBase & {
      mode: "canonical" | "candidate";
      delegatedFrom?: never;
    })
  | (AuthorityDeclarationBase & {
      mode: "delegated";
      delegatedFrom: string;
    });

export interface RelationPackReference {
  id: string;
  version: string;
  uri?: string;
  digest?: string;
}

export interface MetamapDocument {
  $schema?: string;
  schemaVersion: typeof METAMAP_SCHEMA_VERSION;
  id: string;
  namespace: string;
  label?: string;
  revision?: string;
  relationPacks?: RelationPackReference[];
  entities: MetamapEntity[];
  mappings: StructuralMapping[];
  authorities: AuthorityDeclaration[];
  metadata?: JsonObject;
  extensions?: JsonObject;
}

export type CyclePolicy = "allow" | "forbid";
export type ImpactDirection =
  "source-to-target" | "target-to-source" | "both" | "none";

export interface RelationDefinition {
  id: string;
  description?: string;
  sourceKinds?: readonly string[];
  targetKinds?: readonly string[];
  cardinalities?: readonly MappingCardinality[];
  cyclePolicy: CyclePolicy;
  transitive?: boolean;
  symmetric?: boolean;
  inverse?: string;
  composesWith?: readonly string[];
  /**
   * Declares causal propagation independently of traversal direction. This is
   * used for blast-radius analysis; it does not change the meaning of the
   * relation itself.
   */
  impactDirection?: ImpactDirection;
}

export interface RelationPack {
  schemaVersion: "1.0.0";
  id: string;
  version: string;
  description?: string;
  relations: readonly RelationDefinition[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
  subjectId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type TraversalDirection = "outgoing" | "incoming" | "both";

export interface TraversalOptions {
  direction?: TraversalDirection;
  relations?: readonly string[];
  maxDepth?: number;
}

export interface TraversalVisit {
  entity: MetamapEntity;
  depth: number;
  viaMapping?: StructuralMapping;
  predecessor?: string;
}

export interface AuthorityResolution {
  status: "resolved" | "ambiguous" | "unresolved";
  /** The root declaration from which authority originates. */
  canonical?: AuthorityDeclaration;
  /** The declaration that currently owns the requested fact. */
  effective?: AuthorityDeclaration;
  delegationChain?: AuthorityDeclaration[];
  candidates: AuthorityDeclaration[];
}
