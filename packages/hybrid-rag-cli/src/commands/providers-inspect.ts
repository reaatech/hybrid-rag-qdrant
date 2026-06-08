import {
  getProviderDescriptor,
  listProviderNames,
  type ProviderDescriptor,
} from '../provider-descriptors.js';

export interface ProvidersInspectOptions {
  json?: boolean;
}

function formatCost(value: number): string {
  if (value === 0) {
    return '$0 (self-hosted / no per-operation cost)';
  }
  return `$${value}`;
}

function buildJsonView(descriptor: ProviderDescriptor): Record<string, unknown> {
  return {
    provider: descriptor.name,
    description: descriptor.description,
    available: true,
    localDev: descriptor.localDev,
    localSetup: descriptor.localSetup,
    requiredFields: descriptor.requiredFields,
    envVars: descriptor.envVars.map((envVar) => ({
      name: envVar.name,
      legacy: envVar.legacy,
      required: envVar.required,
      secret: Boolean(envVar.secret),
      description: envVar.description,
    })),
    capabilities: descriptor.capabilities,
    costModel: descriptor.costModel,
    nativeHybrid: descriptor.capabilities.supportsHybridSearch,
    migrationScanSupport: descriptor.migrationScanSupport,
    knownLimitations: descriptor.knownLimitations,
  };
}

function printHuman(descriptor: ProviderDescriptor): void {
  const caps = descriptor.capabilities;

  console.log(`Provider: ${descriptor.name}`);
  console.log(`  ${descriptor.description}`);
  console.log('');
  console.log('Availability:');
  console.log('  Adapter available: yes');
  console.log(`  Local development: ${descriptor.localDev ? 'yes' : 'cloud only'}`);
  console.log(`  Local setup: ${descriptor.localSetup}`);
  console.log('');
  console.log('Required config fields:');
  console.log(`  ${descriptor.requiredFields.join(', ')}`);
  console.log('');
  console.log('Supported environment variables:');
  for (const envVar of descriptor.envVars) {
    const flags = [
      envVar.required ? 'required' : 'optional',
      envVar.secret ? 'secret' : undefined,
    ].filter(Boolean);
    const legacy = envVar.legacy ? ` (legacy: ${envVar.legacy})` : '';
    // Never print secret values, only the variable names.
    console.log(`  ${envVar.name}${legacy} [${flags.join(', ')}]`);
    console.log(`    ${envVar.description}`);
  }
  console.log('');
  console.log('Capability flags:');
  console.log(`  Native hybrid search: ${caps.supportsHybridSearch}`);
  console.log(`  Metadata filtering: ${caps.supportsMetadataFiltering}`);
  console.log(`  Batch upsert: ${caps.supportsBatchUpsert}`);
  console.log(`  Collection management: ${caps.supportsCollectionManagement}`);
  console.log(`  Multi-tenancy: ${caps.supportsMultiTenancy}`);
  console.log(`  Quantization: ${caps.supportsQuantization}`);
  console.log(`  Scan (migration source): ${caps.supportsScan}`);
  console.log(`  Max batch size: ${caps.maxBatchSize}`);
  console.log(`  Max vector dimension: ${caps.maxVectorDimension}`);
  console.log('');
  console.log('Cost model:');
  console.log(`  Per-query estimate: ${formatCost(descriptor.costModel.costPerQueryEstimate)}`);
  console.log(`  Per 1000 upserts: ${formatCost(descriptor.costModel.costPer1000Upserts)}`);
  if (descriptor.costModel.monthlyBaseCost !== undefined) {
    console.log(`  Monthly base cost: $${descriptor.costModel.monthlyBaseCost}`);
  }
  console.log('');
  console.log(`Migration scan support: ${descriptor.migrationScanSupport ? 'yes' : 'no'}`);
  console.log(`Native hybrid support: ${caps.supportsHybridSearch ? 'yes' : 'no'}`);
  console.log('');
  console.log('Known limitations:');
  if (descriptor.knownLimitations.length === 0) {
    console.log('  (none)');
  } else {
    for (const limitation of descriptor.knownLimitations) {
      console.log(`  - ${limitation}`);
    }
  }
}

export function providersInspectCommand(
  provider: string,
  options: ProvidersInspectOptions = {},
): void {
  const descriptor = getProviderDescriptor(provider);

  if (!descriptor) {
    const available = listProviderNames().join(', ');
    throw new Error(`Unknown provider '${provider}'. Available providers: ${available}`);
  }

  if (options.json) {
    console.log(JSON.stringify(buildJsonView(descriptor), null, 2));
    return;
  }

  printHuman(descriptor);
}
