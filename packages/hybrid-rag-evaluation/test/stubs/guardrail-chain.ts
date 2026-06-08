/**
 * Test-only stub for the optional @reaatech/guardrail-chain package.
 *
 * The real package is an optional dependency that is not installed in this
 * workspace, so the source loads it through a guarded dynamic import. This stub
 * lets vitest resolve the module id so individual tests can override it with
 * `vi.mock`/`vi.doMock` factories to exercise the guardrail-chain code paths.
 *
 * It is wired in via the `resolve.alias` entry in vitest.config.ts and is never
 * shipped (it lives under test/ and outside the published `dist` files).
 */
export class GuardrailChain {
  addGuardrail(): this {
    return this;
  }
  async execute(): Promise<{ success: boolean; output?: unknown }> {
    return { success: true };
  }
}
