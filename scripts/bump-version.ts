/**
 * Bump workspace package versions:
 *
 *   bun scripts/bump-version.ts <version> [package-name...]
 *
 * With no package names, bumps every public package. Also updates the
 * workspace entries in bun.lock directly: `bun install` does not refresh
 * cached workspace versions after a manual package.json edit, and
 * `bun publish` resolves `workspace:` ranges from the lockfile — a stale
 * lockfile would publish wrong dependency versions.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const ROOT = join(import.meta.dirname, "..");
const [version, ...only] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(
    "usage: bun scripts/bump-version.ts <version> [package-name...]",
  );
  process.exit(1);
}

const bumped = new Map<string, string>(); // workspace path -> name
for (const group of ["packages", "modules"]) {
  for (const entry of readdirSync(join(ROOT, group))) {
    const path = join(ROOT, group, entry, "package.json");
    let pkg: any;
    try {
      pkg = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    if (pkg.private) continue;
    if (only.length && !only.includes(pkg.name)) continue;
    pkg.version = version;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    bumped.set(`${group}/${entry}`, pkg.name);
    console.log(`${pkg.name} -> ${version}`);
  }
}
if (bumped.size === 0) {
  console.error("no packages matched");
  process.exit(1);
}

// Sync the lockfile's cached workspace versions in place.
const lockPath = join(ROOT, "bun.lock");
let lock = readFileSync(lockPath, "utf-8");
for (const path of bumped.keys()) {
  lock = lock.replace(
    new RegExp(
      `("${path}":\\s*\\{\\s*"name":\\s*"[^"]+",\\s*"version":\\s*)"[^"]+"`,
    ),
    `$1"${version}"`,
  );
}
writeFileSync(lockPath, lock);

// Verify the lockfile is consistent (should be a no-op).
const check = await $`bun install --lockfile-only`.cwd(ROOT).nothrow();
if (check.exitCode !== 0) {
  console.error("bun install --lockfile-only failed; check bun.lock");
  process.exit(1);
}
console.log(`\nbumped ${bumped.size} packages; bun.lock synced`);
