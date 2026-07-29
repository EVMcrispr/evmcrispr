#!/usr/bin/env bun
/**
 * Builds the revm-sim Rust crate to WebAssembly and drops the artifacts into
 * modules/sim/src/lib/revm/pkg, which is committed to git so CI and
 * contributors don't need a Rust toolchain. Re-run after changing the crate.
 *
 * Requires: rustup target wasm32-unknown-unknown + wasm-pack.
 *
 * Usage: bun scripts/build-wasm.ts [--check]
 *   --check builds to a temp dir and exits 1 if the committed artifacts are
 *   stale (for a future Rust CI job).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CRATE = join(ROOT, "modules/sim/rust");
const PKG = join(ROOT, "modules/sim/src/lib/revm/pkg");
const check = process.argv.includes("--check");

const outDir = check ? join(tmpdir(), `revm-sim-pkg-${process.pid}`) : PKG;

const res = spawnSync(
  "wasm-pack",
  ["build", "--target", "web", "--release", "--no-pack", "--out-dir", outDir],
  { cwd: CRATE, stdio: "inherit" },
);
if (res.error || res.status !== 0) {
  console.error(
    "wasm-pack build failed. Is wasm-pack installed? (cargo install wasm-pack)",
  );
  process.exit(res.status ?? 1);
}

// wasm-pack drops a .gitignore that would hide the committed artifacts.
const gitignore = join(outDir, ".gitignore");
if (existsSync(gitignore)) unlinkSync(gitignore);

if (check) {
  let stale = false;
  for (const file of readdirSync(outDir)) {
    const fresh = readFileSync(join(outDir, file));
    const committed = existsSync(join(PKG, file))
      ? readFileSync(join(PKG, file))
      : null;
    if (!committed || !fresh.equals(committed)) {
      console.error(`stale artifact: ${file}`);
      stale = true;
    }
  }
  rmSync(outDir, { recursive: true, force: true });
  process.exit(stale ? 1 : 0);
}

console.log(`Built revm-sim wasm into ${PKG}`);
