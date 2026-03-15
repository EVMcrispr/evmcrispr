import { readFileSync } from "node:fs";
import { validateEvml } from "../tools/validate-evml.js";

export async function runValidate(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) {
    console.error("Usage: evmcrispr validate <file>");
    process.exit(1);
  }

  const script = file === "-" ? readStdin() : readFileSync(file, "utf-8");

  const result = validateEvml(script);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

function readStdin(): string {
  return readFileSync(0, "utf-8");
}
