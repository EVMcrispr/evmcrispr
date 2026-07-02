import { evml } from "@evmcrispr/core";

export function validateEvml(script: string) {
  const s = evml.script(script);
  const diagnostics = s.diagnostics;
  const symbols = s.symbols;
  const valid = diagnostics.every((d) => d.severity !== "error");

  return { diagnostics, symbols, valid };
}
