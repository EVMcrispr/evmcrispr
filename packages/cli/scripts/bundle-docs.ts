#!/usr/bin/env bun
/**
 * Prebuild script: copies documentation from the monorepo into docs/
 * so the CLI package can ship self-contained docs in the npm tarball.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(import.meta.dirname, "../docs");

const MODULES = ["std", "sim", "aragonos", "ens", "giveth", "http"];

async function copyIfExists(src: string, dest: string): Promise<void> {
  try {
    await cp(src, dest);
  } catch {
    // Source doesn't exist — skip silently
  }
}

async function copyMdFiles(srcDir: string, destDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(srcDir);
  } catch {
    return;
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));
  if (mdFiles.length === 0) return;

  await mkdir(destDir, { recursive: true });
  for (const file of mdFiles) {
    await cp(join(srcDir, file), join(destDir, file));
  }
}

// Clean previous output
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Copy llms-full.txt
await copyIfExists(
  join(ROOT, "apps/evmcrispr-website/public/llms-full.txt"),
  join(OUT, "llms-full.txt"),
);

// Copy per-module docs
for (const mod of MODULES) {
  const modOut = join(OUT, "modules", mod);

  // README.md
  await mkdir(modOut, { recursive: true });
  await copyIfExists(
    join(ROOT, "modules", mod, "README.md"),
    join(modOut, "README.md"),
  );

  // commands/*.md
  await copyMdFiles(
    join(ROOT, "modules", mod, "src/commands"),
    join(modOut, "commands"),
  );

  // helpers/*.md
  await copyMdFiles(
    join(ROOT, "modules", mod, "src/helpers"),
    join(modOut, "helpers"),
  );
}

console.log("docs/ bundled successfully");
