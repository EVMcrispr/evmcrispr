/**
 * The src shebang is bun so the dev symlink can execute src/bin.ts directly,
 * but the published bundle has no Bun dependency — point it at node so
 * `npx evmcrispr` works without bun installed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bin = join(import.meta.dirname, "../dist/bin.js");
const source = readFileSync(bin, "utf-8");
writeFileSync(
  bin,
  source.replace(/^#!\/usr\/bin\/env bun/, "#!/usr/bin/env node"),
);
