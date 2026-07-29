import { evml } from "@evmcrispr/core";

export async function validateEvml(script: string) {
  const s = evml.script(script);
  const symbols = s.symbols;
  // Full validation: syntactic parse errors + static semantic diagnostics
  // (unknown commands/helpers/modules, arg counts, options, variables, …).
  const { diagnostics, valid } = await s.validate();

  return { diagnostics, symbols, valid };
}
