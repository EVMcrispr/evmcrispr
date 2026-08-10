import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every both-faced helper documents its on-chain face.
 *
 * The `## On-chain face` section is where a face's limits live — what it
 * refuses, what it reads instead of erroring, how it fails. A helper that
 * grows a `compile` face without one is a face nobody can find out about, and
 * the gap is invisible because the generated part of the page still renders.
 *
 * Deliberately a check on DOCS rather than on parity cases. A parity case
 * needs a target that exists on the fork, and some faces legitimately have
 * none — `@merkle.verify!` needs a contract returning a bytes32[] proof, and
 * nothing on the Gnosis fork exposes one for a tree whose root we know. A doc
 * section is always writable, so it can be required without exceptions.
 */

const MODULES = join(import.meta.dir, "../../../../modules");

function bothFacedHelpers(): { module: string; helper: string; md: string }[] {
  const out: { module: string; helper: string; md: string }[] = [];
  for (const module of readdirSync(MODULES)) {
    const dir = join(MODULES, module, "src/helpers");
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".ts")) continue;
      const src = readFileSync(join(dir, entry), "utf8");
      // The same shape the codegen keys on: a face at config top level.
      if (!/^ {2}compile:/m.test(src)) continue;
      if (!/^ {2}(async )?run\(|^ {2}run:/m.test(src)) continue;
      out.push({
        module,
        helper: entry.slice(0, -3),
        md: join(dir, entry.replace(/\.ts$/, ".md")),
      });
    }
  }
  return out;
}

describe("parity coverage", () => {
  const helpers = bothFacedHelpers();

  it("finds the both-faced helpers", () => {
    // A guard on the guard: if detection broke, the check below would pass
    // vacuously over an empty list.
    expect(helpers.length).toBeGreaterThan(100);
  });

  it("every both-faced helper documents its on-chain face", () => {
    const missing = helpers
      .filter(({ md }) => {
        try {
          return !readFileSync(md, "utf8").includes("## On-chain face");
        } catch {
          return true;
        }
      })
      .map(({ module, helper }) => `${module}:${helper}`);

    if (missing.length > 0) {
      throw new Error(
        `these helpers have both faces but no "## On-chain face" section:\n  ${missing.join("\n  ")}\n` +
          "Document what the on-chain face refuses, reads instead, or how it fails.",
      );
    }
  });
});
