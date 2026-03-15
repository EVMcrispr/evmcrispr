import { EVMcrispr } from "@evmcrispr/core";

export function validateEvml(script: string) {
  const evm = new EVMcrispr();
  const diagnostics = evm.getDiagnostics(script);
  const symbols = evm.getDocumentSymbols(script);
  const valid = diagnostics.every((d) => d.severity !== "error");

  return { diagnostics, symbols, valid };
}
