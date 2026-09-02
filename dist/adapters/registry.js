import { JsonCollectionsAdapter } from "./json-collections.js";
import { LegacySourcesAdapter } from "./legacy-sources.js";
import { MetamapShardAdapter } from "./metamap-shard.js";
import { PrismaAdapter } from "./prisma.js";
import { TypeScriptZodAdapter } from "./typescript-zod.js";
/** Runtime registry for built-in and consumer-supplied source adapters. */
export class AdapterRegistry {
    adapters = new Map();
    register(adapter) {
        if (this.adapters.has(adapter.id)) {
            throw new Error(`Adapter ${adapter.id} is already registered`);
        }
        // Erase only the configuration specialization at the registry boundary.
        // The original adapter still receives the unchanged config document.
        const registered = {
            id: adapter.id,
            version: adapter.version,
            fingerprint: (config, context) => adapter.fingerprint(config, context),
            discover: (config, context) => adapter.discover(config, context),
        };
        this.adapters.set(adapter.id, registered);
        return this;
    }
    get(id) {
        return this.adapters.get(id);
    }
    require(id) {
        const adapter = this.get(id);
        if (!adapter) {
            const available = this.ids();
            throw new Error(`Adapter ${id} is not registered${available.length > 0 ? `; available adapters: ${available.join(", ")}` : ""}`);
        }
        return adapter;
    }
    ids() {
        return [...this.adapters.keys()].sort();
    }
}
/** A fresh registry prevents state leakage between independent workspaces. */
export function createDefaultAdapterRegistry() {
    return new AdapterRegistry()
        .register(new PrismaAdapter())
        .register(new TypeScriptZodAdapter())
        .register(new LegacySourcesAdapter())
        .register(new JsonCollectionsAdapter())
        .register(new MetamapShardAdapter());
}
//# sourceMappingURL=registry.js.map