import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CODEGEN = join(import.meta.dirname, "../../scripts/codegen.ts");

/** Run codegen over a fresh src dir containing the given helper files. */
function runCodegen(helpers: Record<string, string>): {
  exitCode: number;
  stderr: string;
  generated: string;
} {
  const src = join(mkdtempSync(join(tmpdir(), "codegen-test-")), "src");
  mkdirSync(join(src, "helpers"), { recursive: true });
  for (const [file, content] of Object.entries(helpers)) {
    writeFileSync(join(src, "helpers", file), content);
  }
  const proc = Bun.spawnSync(["bun", CODEGEN, src], { cwd: src });
  let generated = "";
  try {
    generated = readFileSync(join(src, "_generated.ts"), "utf-8");
  } catch {
    /* codegen failed before writing */
  }
  return {
    exitCode: proc.exitCode,
    stderr: proc.stderr.toString(),
    generated,
  };
}

const helperSource = (config: string) => `
import { defineHelper } from "@evmcrispr/sdk";

export default defineHelper({
${config}
});
`;

describe("codegen two-key helper emission", () => {
  it("emits a single key for a run-only helper", () => {
    const { exitCode, generated } = runCodegen({
      "plain.ts": helperSource(`
  name: "plain",
  description: "An off-chain helper.",
  returnType: "number",
  args: [],
  async run() {
    return "1";
  },`),
    });
    expect(exitCode).toBe(0);
    expect(generated).toContain('"plain": {');
    expect(generated).not.toContain('"plain!"');
    expect(generated).not.toContain("onchain");
  });

  it("emits both keys sharing one loader for a two-faced helper", () => {
    const { exitCode, generated } = runCodegen({
      "both.ts": helperSource(`
  name: "both",
  description: "A two-faced helper.",
  returnType: "number",
  args: [{ name: "value", type: "number", description: "Operand" }],
  async run() {
    return "1";
  },
  compile: async () => ({ kind: "const", cat: "Uint", value: "1" }),`),
    });
    expect(exitCode).toBe(0);
    const runKey = generated.match(/"both": \{ (.*) \},/);
    const bangKey = generated.match(/"both!": \{ (.*) \},/);
    expect(runKey).not.toBeNull();
    expect(bangKey).not.toBeNull();
    expect(runKey![1]).toContain('import("./helpers/both")');
    expect(bangKey![1]).toContain('import("./helpers/both")');
    expect(bangKey![1]).toContain("onchain: true");
    expect(runKey![1]).not.toContain("onchain");
    // Shared metadata rides on both keys.
    expect(bangKey![1]).toContain('returnType: "number"');
    expect(bangKey![1]).toContain('argDefs: [{ name: "value"');
  });

  it("emits only the bang key for a compile-only helper", () => {
    const { exitCode, generated } = runCodegen({
      "onchainonly.ts": helperSource(`
  name: "onchainonly",
  description: "On-chain only.",
  returnType: "bool",
  args: [],
  compile: async () => ({ kind: "const", cat: "Bool", value: true }),`),
    });
    expect(exitCode).toBe(0);
    expect(generated).toContain('"onchainonly!": {');
    expect(generated).toContain("onchain: true");
    expect(generated).not.toMatch(/"onchainonly": \{/);
  });

  it("records batchable: false metadata on the run key only", () => {
    const { exitCode, generated } = runCodegen({
      "reader.ts": helperSource(`
  name: "reader",
  batchable: false,
  description: "Reads chain state.",
  returnType: "number",
  args: [],
  async run() {
    return "1";
  },
  compile: async () => ({ kind: "const", cat: "Uint", value: "1" }),`),
    });
    expect(exitCode).toBe(0);
    const runKey = generated.match(/"reader": \{ (.*) \},/);
    const bangKey = generated.match(/"reader!": \{ (.*) \},/);
    expect(runKey![1]).toContain("batchable: false");
    expect(bangKey![1]).not.toContain("batchable");
  });

  it("hard-errors when a declared name ends in `!`", () => {
    const { exitCode, stderr } = runCodegen({
      "legacy.ts": helperSource(`
  name: "legacy!",
  description: "A legacy bang declaration.",
  returnType: "number",
  args: [],
  compile: async () => ({ kind: "const", cat: "Uint", value: "1" }),`),
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("never include the trailing `!`");
  });

  it("does not mistake method calls in face bodies for face declarations", () => {
    const { exitCode, generated } = runCodegen({
      "methodcall.ts": helperSource(`
  name: "methodcall",
  description: "compile only, with a run method call inside.",
  returnType: "number",
  args: [],
  compile: async (ctx) => {
    const out = await ctx.module.run("something");
    return { kind: "const", cat: "Uint", value: out };
  },`),
    });
    expect(exitCode).toBe(0);
    expect(generated).toContain('"methodcall!": {');
    expect(generated).not.toMatch(/"methodcall": \{/);
  });
});
