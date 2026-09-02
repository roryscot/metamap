import type { MetamapSourceConfig } from "../config.js";
import { JsonCollectionsAdapter } from "./json-collections.js";
import { LegacySourcesAdapter } from "./legacy-sources.js";
import { MetamapShardAdapter } from "./metamap-shard.js";
import { PrismaAdapter } from "./prisma.js";
import type {
  AdapterContext,
  AdapterInput,
  AdapterResult,
  MetamapAdapter,
} from "./types.js";
import { TypeScriptZodAdapter } from "./typescript-zod.js";

interface RegisteredAdapter extends MetamapAdapter<MetamapSourceConfig> {
  readonly id: string;
}

/** Runtime registry for built-in and consumer-supplied source adapters. */
export class AdapterRegistry {
  private readonly adapters = new Map<string, RegisteredAdapter>();

  register<TConfig extends MetamapSourceConfig>(
    adapter: MetamapAdapter<TConfig>,
  ): this {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter ${adapter.id} is already registered`);
    }
    // Erase only the configuration specialization at the registry boundary.
    // The original adapter still receives the unchanged config document.
    const registered: RegisteredAdapter = {
      id: adapter.id,
      version: adapter.version,
      fingerprint: (config: MetamapSourceConfig, context: AdapterContext) =>
        adapter.fingerprint(config as TConfig, context),
      discover: (config: MetamapSourceConfig, context: AdapterContext) =>
        adapter.discover(config as TConfig, context),
    };
    this.adapters.set(adapter.id, registered);
    return this;
  }

  get(id: string): MetamapAdapter<MetamapSourceConfig> | undefined {
    return this.adapters.get(id);
  }

  require(id: string): MetamapAdapter<MetamapSourceConfig> {
    const adapter = this.get(id);
    if (!adapter) {
      const available = this.ids();
      throw new Error(
        `Adapter ${id} is not registered${available.length > 0 ? `; available adapters: ${available.join(", ")}` : ""}`,
      );
    }
    return adapter;
  }

  ids(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

/** A fresh registry prevents state leakage between independent workspaces. */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry()
    .register(new PrismaAdapter())
    .register(new TypeScriptZodAdapter())
    .register(new LegacySourcesAdapter())
    .register(new JsonCollectionsAdapter())
    .register(new MetamapShardAdapter());
}

// Retain these imports in generated declarations for adapter authors.
export type { AdapterInput, AdapterResult };
