import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { LegacySourcesConfig } from "../config.js";
import { makeUrn } from "../references.js";
import { contentDigest } from "../stable.js";
import {
  adaptLegacySourcesOfTruth,
  isLegacySourceOfTruthDocument,
} from "./source-of-truth.js";
import type { AdapterContext, AdapterResult, MetamapAdapter } from "./types.js";

const ADAPTER_VERSION = "1.0.0";

export class LegacySourcesAdapter implements MetamapAdapter<LegacySourcesConfig> {
  readonly id = "legacy-sources" as const;
  readonly version = ADAPTER_VERSION;

  async fingerprint(
    config: LegacySourcesConfig,
    context: AdapterContext,
  ): Promise<AdapterResult["inputs"]> {
    const absolutePath = resolve(context.repositoryRoot, config.path);
    const source = await readFile(absolutePath, "utf8");
    return [
      {
        path: relative(context.repositoryRoot, absolutePath).replaceAll(
          "\\",
          "/",
        ),
        digest: contentDigest(source),
      },
    ];
  }

  async discover(
    config: LegacySourcesConfig,
    context: AdapterContext,
  ): Promise<AdapterResult> {
    const absolutePath = resolve(context.repositoryRoot, config.path);
    const source = await readFile(absolutePath, "utf8");
    const digest = contentDigest(source);
    const repositoryPath = relative(
      context.repositoryRoot,
      absolutePath,
    ).replaceAll("\\", "/");
    const value = JSON.parse(source) as unknown;
    if (!isLegacySourceOfTruthDocument(value)) {
      throw new Error(
        `${repositoryPath} is not a legacy sources-of-truth document`,
      );
    }
    const adapted = adaptLegacySourcesOfTruth(value, {
      namespace: context.namespace,
      repository: context.repository,
      documentId: makeUrn(context.namespace, "metamap-shard", config.id),
      label: `Legacy source catalog: ${config.id}`,
    });
    adapted.document.revision = digest;
    adapted.document.metadata = {
      ...(adapted.document.metadata ?? {}),
      adapterVersion: this.version,
      sourceId: config.id,
    };

    return {
      sourceId: config.id,
      adapter: this.id,
      adapterVersion: this.version,
      inputs: [{ path: repositoryPath, digest }],
      document: adapted.document,
      diagnostics: adapted.warnings.map((warning) => ({
        severity: "warning",
        code: warning.code,
        message: warning.message,
        path: warning.value,
        subjectId: warning.entryId,
      })),
    };
  }
}
