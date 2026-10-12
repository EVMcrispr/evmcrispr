import { expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CODEGEN = resolve(import.meta.dir, "../../scripts/codegen.ts");

function generate(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "codegen-events-"));
  writeFileSync(join(dir, "package.json"), "{}");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const run = Bun.spawnSync(["bun", CODEGEN], { cwd: dir });
  expect(run.exitCode).toBe(0);
  return readFileSync(join(dir, "src/_generated.ts"), "utf-8");
}

it("emits one entry per event file, with its signature and description", () => {
  const out = generate({
    "src/events/roleGranted.ts": `export default defineEvent({
      name: "roleGranted",
      description: "A role was granted.",
      event: "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
      suggest: async () => [],
    });`,
    "src/events/_shared.ts": "export const x = 1;",
  });
  expect(out).toContain(
    'import type { EventImportMap } from "@evmcrispr/sdk";',
  );
  expect(out).toContain(
    '"roleGranted": { load: () => import("./events/roleGranted"), event: "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)", description: "A role was granted." },',
  );
  expect(out).not.toContain("_shared");
});

it("emits an empty map for a module without events", () => {
  expect(generate({ "src/commands/.keep": "" })).toContain(
    "export const events = {};",
  );
});

it("refuses an event file without a literal signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "codegen-events-"));
  writeFileSync(join(dir, "package.json"), "{}");
  mkdirSync(join(dir, "src/events"), { recursive: true });
  writeFileSync(
    join(dir, "src/events/bad.ts"),
    "export default defineEvent({ name: 'bad', event: SIG });",
  );
  const run = Bun.spawnSync(["bun", CODEGEN], { cwd: dir });
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString()).toContain("bad.ts");
});
