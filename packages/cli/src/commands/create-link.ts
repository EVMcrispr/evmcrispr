import { readFileSync } from "node:fs";
import { createLink } from "../tools/create-link.js";

const USAGE = `Usage: evmcrispr create-link <title> <file> [base-url]

Pin an EVML script to IPFS and print a shareable link. Pass - to read from stdin.

Example: evmcrispr create-link "Send WETH to Griff" griff.evml`;

export async function runCreateLink(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const title = args[0];
  const file = args[1];
  const baseUrl = args[2];

  if (!title || !file) {
    console.error(USAGE);
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
