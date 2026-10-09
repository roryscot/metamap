import type * as kernel from "../../../dist/index.js";

export declare const exampleRoot: string;
export declare class BindingBuildError extends Error {
  issues: Array<{ code: string; message: string; subjectId?: string }>;
}
export interface BindingBuildOptions {
  /** Test-only injection of the source kernel; the CLI uses the packaged kernel. */
  kernel?: object;
  context?: kernel.EvaluationContext;
}
export interface BindingBuildResult {
  status: "admitted";
  authorization: "legacy-ungoverned";
  policy: kernel.MetamapViabilityPolicy;
  generation: kernel.ViableGeneration;
  projection: kernel.MetamapProjection;
  graph: kernel.MetamapDocument;
  registry: unknown;
  snapshot: kernel.MetamapSnapshot;
  runtimeArtifacts: Array<{ path: string; digest: string; sourcePath: string }>;
  coverage: Array<{
    sourceId: string;
    owner: string;
    entityId: string;
    relation: string;
    mappings: string[];
    exclusion?: {
      entity: string;
      relation: string;
      reason: string;
      assertedBy: string;
    };
  }>;
  files: Record<string, string>;
}
export declare function prepareBindings(
  root?: string,
  options?: BindingBuildOptions,
): Promise<BindingBuildResult>;
export declare function generateBindings(
  root?: string,
  options?: BindingBuildOptions,
): Promise<BindingBuildResult>;
