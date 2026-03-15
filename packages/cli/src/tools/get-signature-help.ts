import { createEVMcrisprInstance } from "../lib/evmcrispr-factory.js";

export async function getSignatureHelp(
  script: string,
  line: number,
  col: number,
) {
  const { evm } = createEVMcrisprInstance();
  return evm.getSignatureHelp(script, { line, col });
}
