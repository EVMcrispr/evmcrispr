import { registerAllModules } from "../lib/modules.js";
import { readScriptSource } from "../lib/read-source";
import { simulateEvml } from "../tools/simulate-evml.js";

const USAGE = `Usage: evmcrispr simulate <file>

Simulate an EVML script and print the resulting actions. Pass - to read from stdin.`;

export async function runSimulate(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const file = args[0];
  if (!file) {
    console.error(USAGE);
    process.exit(1);
  }

  const script = await readScriptSource(file);

  registerAllModules();

  const result = await simulateEvml({ script });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
