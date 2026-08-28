/**
 * Publish every public workspace package to npm in dependency order.
 *
 * Uses `bun publish` (NOT plain `npm publish`, which ships `workspace:`
 * ranges verbatim; bun rewrites them to the real versions at pack time).
 * All packages version in lockstep, so a run against the default registry
 * ensures a single `v<version>` git tag instead of one tag per package.
 *
 * Idempotent: versions already on the registry are skipped, so a partially
 * failed run can simply be re-run. Honors NPM_CONFIG_REGISTRY (used by the
 * verdaccio smoke test).
 *
 *   bun scripts/publish-packages.ts [--dry-run]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");

interface Pkg {
  name: string;
  version: string;
  dir: string;
  internalDeps: string[];
}

const pkgs = new Map<string, Pkg>();
for (const group of ["packages", "modules"]) {
  for (const entry of readdirSync(join(ROOT, group))) {
    const dir = join(ROOT, group, entry);
    let manifest: any;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    } catch {
      continue;
    }
    if (manifest.private) continue;
    const internalDeps = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }).filter((d) => d.startsWith("@evmcrispr/") || d === "evmcrispr");
    pkgs.set(manifest.name, {
      name: manifest.name,
      version: manifest.version,
      dir,
      internalDeps,
    });
  }
}

// Topological sort: dependencies before dependents.
const order: Pkg[] = [];
const visiting = new Set<string>();
const done = new Set<string>();
function visit(name: string) {
  if (done.has(name) || !pkgs.has(name)) return;
  if (visiting.has(name)) throw new Error(`dependency cycle at ${name}`);
  visiting.add(name);
  for (const dep of pkgs.get(name)!.internalDeps) visit(dep);
  visiting.delete(name);
  done.add(name);
  order.push(pkgs.get(name)!);
}
for (const name of pkgs.keys()) visit(name);

console.log(
  `${order.length} packages to publish${dryRun ? " (dry run)" : ""}\n`,
);

let published = 0;
let skipped = 0;
for (const pkg of order) {
  const spec = `${pkg.name}@${pkg.version}`;
  const existing = await $`npm view ${spec} version`.quiet().nothrow();
  if (existing.exitCode === 0 && existing.stdout.toString().trim()) {
    console.log(`skip (already published): ${spec}`);
    skipped++;
    continue;
  }
  if (pkg.name === "@evmcrispr/module-gelato") {
    // The EVML runner Web3 Function is published per release and its CID
    // pinned in the package: a gelato release must carry a runner built
    // from the same version (`bun run publish-runner` in modules/gelato).
    const published = await import(join(pkg.dir, "src/runner/published.ts"));
    if (published.RUNNER_VERSION !== pkg.version || !published.RUNNER_CID) {
      throw new Error(
        `${spec} pins an EVML runner from ${published.RUNNER_VERSION || "no release"}: run \`bun run publish-runner\` in modules/gelato and commit src/runner/published.ts first`,
      );
    }
  }
  console.log(`publish: ${spec}`);
  const flags = ["--access", "public", ...(dryRun ? ["--dry-run"] : [])];
  let alreadyPublished = false;
  for (let attempt = 1; ; attempt++) {
    const result = await $`bun publish ${flags}`.cwd(pkg.dir).nothrow();
    if (result.exitCode === 0) break;
    const output = result.stdout.toString() + result.stderr.toString();
    // `npm view` lags freshly published versions; the 403 means it's up.
    if (output.includes("previously published versions")) {
      console.log(`skip (already published): ${spec}`);
      alreadyPublished = true;
      break;
    }
    if (output.includes("429") && attempt < 6) {
      console.log(`rate limited, retrying in 60s (attempt ${attempt}/5)…`);
      await Bun.sleep(60_000);
      continue;
    }
    console.error(`\nFAILED: ${spec} (exit ${result.exitCode})`);
    console.error(
      "Fix the issue and re-run; already-published packages are skipped.",
    );
    process.exit(1);
  }
  if (alreadyPublished) {
    skipped++;
    continue;
  }
  published++;
}

console.log(`\ndone: ${published} published, ${skipped} skipped`);
if (!dryRun && !process.env.NPM_CONFIG_REGISTRY) {
  const tag = `v${pkgs.get("evmcrispr")!.version}`;
  const exists = await $`git rev-parse --verify refs/tags/${tag}`
    .cwd(ROOT)
    .quiet()
    .nothrow();
  if (exists.exitCode !== 0) {
    await $`git tag ${tag}`.cwd(ROOT).quiet();
    console.log(`tagged ${tag}; push it with: git push origin ${tag}`);
  }
}
