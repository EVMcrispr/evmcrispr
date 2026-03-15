import { readFileSync } from "node:fs";
import { createLink } from "../tools/create-link.js";

export async function runCreateLink(args: string[]): Promise<void> {
  const title = args[0];
  const file = args[1];
  const baseUrl = args[2];

  if (!title || !file) {
    console.error(
      'Usage: evmcrispr create-link <title> <file> [base-url]\n\nExample: evmcrispr create-link "Send WETH to Griff" griff.evml',
    );
    process.exit(1);
  }

  const script =
    file === "-" ? readFileSync(0, "utf-8") : readFileSync(file, "utf-8");

  const result = await createLink({ script, title, baseUrl });

  if (result.success) {
    console.log(result.url);
  } else {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}
