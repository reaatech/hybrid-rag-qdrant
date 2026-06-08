/**
 * Test-only stub for the optional @reaatech/agent-budget-pricing package.
 *
 * The real package is an optional peer that is not installed in this workspace,
 * so the source uses a dynamic import guarded by try/catch. This stub exists
 * purely so vitest can resolve the module id and individual tests can override
 * it with `vi.mock`/`vi.doMock` factories to exercise the engine code paths.
 *
 * It is wired in via the `resolve.alias` entry in vitest.config.ts and is never
 * shipped (it lives under test/ and outside the published `dist` files).
 */
export class PricingEngine {
  computeCost(): number {
    return 0;
  }
  estimateCost(): number {
    return 0;
  }
}
