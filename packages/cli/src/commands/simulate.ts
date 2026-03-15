import { readFileSync } from "node:fs";
import { registerAllModules } from "../lib/modules.js";
import { simulateEvml } from "../tools/simulate-evml.js";

export async function runSimulate(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) {
    console.error("Usage: evmcrispr simulate <file>");
    process.exit(1);
  }

  const script = file === "-" ? readStdin() : readFileSync(file, "utf-8");

  registerAllModules();

  const result = await simulateEvml({ script });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

function readStdin(): string {
  return readFileSync(0, "utf-8");
}
