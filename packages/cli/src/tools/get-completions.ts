import { createEVMcrisprInstance } from "../lib/evmcrispr-factory.js";

export async function getCompletions(
  script: string,
  line: number,
  col: number,
) {
  const { evm } = await createEVMcrisprInstance();
  return evm.getCompletions(script, { line, col });
}
