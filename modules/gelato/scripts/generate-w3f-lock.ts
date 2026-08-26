#!/usr/bin/env bun
/**
 * Regenerate src/utils/w3fLock.ts: the exact dependency graph a Web3
 * Function bundle may draw from. `gelato:publish-function` bundles user
 * TypeScript in the browser with esbuild-wasm and resolves every bare
 * import against this lock, so the set of npm packages that can end up in
 * a published function is audited here (versions are immutable on npm and
 * every tarball is verified against the registry's integrity hash when
 * fetched) rather than decided by whatever the registry serves later.
 *
 * Roots: the Web3 Functions SDK itself plus the libraries Gelato's own
 * templates import. Run after bumping a root: bun scripts/generate-w3f-lock.ts
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOTS: Record<string, string> = {
  "@gelatonetwork/web3-functions-sdk": "2.4.4",
  ethers: "6.16.0",
  ky: "1.14.0",
};

const dir = mkdtempSync(join(tmpdir(), "w3f-lock-"));
try {
  await Bun.write(
    join(dir, "package.json"),
    JSON.stringify({ name: "w3f-lock", private: true, dependencies: ROOTS }),
  );
  const install = Bun.spawnSync(["bun", "install", "--ignore-scripts"], {
    cwd: dir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (install.exitCode !== 0) throw new Error("bun install failed");

  const require = createRequire(join(dir, "index.js"));

  function pkgDir(name: string, from: string): string {
    // Resolve the package root through Node's algorithm from `from`, so
    // nested (non-hoisted) versions are honoured exactly as bun laid them out.
    const paths = [from];
    try {
      return dirname(require.resolve(`${name}/package.json`, { paths }));
    } catch {
      // Packages whose `exports` hides package.json: resolve the main entry
      // and walk up to the nearest package.json with that name.
      let cur = dirname(require.resolve(name, { paths }));
      for (;;) {
        try {
          const pj = JSON.parse(
            readFileSync(join(cur, "package.json"), "utf8"),
          );
          if (pj.name === name) return cur;
        } catch {}
        const up = dirname(cur);
        if (up === cur) throw new Error(`package root of ${name} not found`);
        cur = up;
      }
    }
  }

  // The closure is what a browser bundle of the roots (plus the XHR polyfill
  // every function gets injected) actually reaches — the SDK also depends
  // on its CLI tooling (express, dockerode, esbuild…), which no Web3
  // Function can import at runtime.
  const esbuild = await import("esbuild-wasm");
  const sdkDir = pkgDir("@gelatonetwork/web3-functions-sdk", dir);
  await Bun.write(
    join(dir, "probe.ts"),
    Object.keys(ROOTS)
      .map((n) => `import "${n}";`)
      .join("\n"),
  );
  const { metafile } = await esbuild.build({
    entryPoints: [join(dir, "probe.ts")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    inject: [join(sdkDir, "dist/lib/polyfill/XMLHttpRequest.js")],
    metafile: true,
    logLevel: "silent",
  });
  /** name@version → package dir */
  const reached = new Map<string, string>();
  for (const input of Object.keys(metafile.inputs)) {
    // "(disabled):…" inputs are imports a package's `browser` field maps to
    // false — empty modules in the bundle, so not part of the closure.
    if (input.startsWith("(")) continue;
    let cur = dirname(join(dir, input));
    while (cur.startsWith(dir)) {
      try {
        const pj = JSON.parse(readFileSync(join(cur, "package.json"), "utf8"));
        if (pj.name && pj.version) {
          reached.set(`${pj.name}@${pj.version}`, cur);
          break;
        }
      } catch {}
      cur = dirname(cur);
    }
  }

  /** name@version → { dep name → resolved version }, reached packages only */
  const lock: Record<string, Record<string, string>> = {};
  for (const [key, root] of reached) {
    const pj = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const wanted = {
      ...(pj.dependencies ?? {}),
      ...(pj.peerDependencies ?? {}),
      ...(pj.optionalDependencies ?? {}),
    } as Record<string, string>;
    const deps: Record<string, string> = {};
    for (const dep of Object.keys(wanted).sort()) {
      try {
        const depPj = JSON.parse(
          readFileSync(join(pkgDir(dep, root), "package.json"), "utf8"),
        );
        if (reached.has(`${dep}@${depPj.version}`)) deps[dep] = depPj.version;
      } catch {
        // not installed (optional/peer) or not reached: unusable anyway
      }
    }
    lock[key] = deps;
  }

  // What a bare import resolves to from the function itself — and what a
  // package's undeclared ("phantom") import of a hoisted dependency gets,
  // exactly as in the node_modules tree `w3f deploy` bundles from.
  const hoisted: Record<string, string> = {};
  for (const key of [...reached.keys()].sort()) {
    const name = key.slice(0, key.lastIndexOf("@"));
    if (hoisted[name]) continue;
    try {
      const pj = JSON.parse(
        readFileSync(join(pkgDir(name, dir), "package.json"), "utf8"),
      );
      if (reached.has(`${name}@${pj.version}`)) hoisted[name] = pj.version;
    } catch {}
  }

  const roots: Record<string, string> = {};
  for (const name of Object.keys(ROOTS).sort()) {
    roots[name] = hoisted[name];
    if (roots[name] !== ROOTS[name]) {
      throw new Error(
        `${name} resolved to ${roots[name]}, wanted ${ROOTS[name]}`,
      );
    }
  }

  const keys = Object.keys(lock).sort();
  const body = keys
    .map((k) => {
      const deps = Object.entries(lock[k])
        .map(([d, v]) => `"${d}": "${v}"`)
        .join(", ");
      return `  "${k}": {${deps ? ` ${deps} ` : ""}},`;
    })
    .join("\n");
  const rootBody = Object.entries(roots)
    .map(([n, v]) => `  "${n}": "${v}",`)
    .join("\n");
  const hoistedBody = Object.entries(hoisted)
    .map(([n, v]) => `  "${n}": "${v}",`)
    .join("\n");
  const out = `// AUTO-GENERATED by scripts/generate-w3f-lock.ts — do not edit.
// The exact npm dependency graph gelato:publish-function may bundle from,
// resolved with bun at generation time. Versions are immutable on npm and
// tarballs are verified against the registry's integrity hash on download,
// so this file is the audited trust root for what a published Web3 Function
// can contain.

/** The libraries a function is meant to import bare (name → version). */
export const W3F_ROOTS: Record<string, string> = {
${rootBody}
};

/** Top-level node_modules view: what a bare import resolves to when a
 *  package does not declare it (name → version). */
export const W3F_HOISTED: Record<string, string> = {
${hoistedBody}
};

/** name@version → its dependencies' resolved versions. */
export const W3F_LOCK: Record<string, Record<string, string>> = {
${body}
};
`;
  const target = join(import.meta.dirname, "../src/utils/w3fLock.ts");
  await Bun.write(target, out);
  console.log(`wrote ${keys.length} packages to ${target}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
