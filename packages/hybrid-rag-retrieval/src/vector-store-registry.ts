import type {
  VectorStoreAdapter,
  VectorStoreConfig,
  VectorStoreProvider,
} from '@reaatech/hybrid-rag';

type AdapterConstructor = new (config: VectorStoreConfig) => VectorStoreAdapter;

const registry = new Map<VectorStoreProvider, AdapterConstructor>();

export function registerVectorStore(provider: VectorStoreProvider, ctor: AdapterConstructor): void {
  registry.set(provider, ctor);
}

export function getRegisteredProviders(): VectorStoreProvider[] {
  return Array.from(registry.keys());
}

export function hasProvider(provider: string): provider is VectorStoreProvider {
  return registry.has(provider as VectorStoreProvider);
}

export function createFromRegistry(config: VectorStoreConfig): VectorStoreAdapter {
  const Ctor = registry.get(config.provider);
  if (!Ctor) {
    throw new Error(
      `Provider "${config.provider}" is not registered. Install the adapter package and register it.`,
    );
  }
  return new Ctor(config);
}
