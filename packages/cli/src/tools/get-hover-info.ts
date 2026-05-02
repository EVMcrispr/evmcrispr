import { createEVMcrisprInstance } from "../lib/evmcrispr-factory.js";

export async function getHoverInfo(script: string, line: number, col: number) {
  const { evm } = await createEVMcrisprInstance();
  return evm.getHoverInfo(script, { line, col });
}
