import { describe, expect, it } from "bun:test";
import { defineCommand, defineModule } from "@evmcrispr/sdk";
import { createEvml, Interpreter } from "../../../src";

let runs = 0;
const BlockTestModule = defineModule("blocktest", {
  pair: {
    load: async () => ({
      default: defineCommand({
        name: "pair",
        args: [
          {
            name: "payload",
            type: ["block", "string"],
            supportsSmartBlock: true,
          },
          { name: "body", type: "block" },
        ],
        run: async () => {
          runs++;
          return [];
        },
      }),
    }),
  },
});
const tag = createEvml().use(BlockTestModule);
const account = "0x1111111111111111111111111111111111111111";
const diagnostics = async (script: string) =>
  (await tag.workspace().getFullDiagnostics(script)).filter(
    (d) => d.source === "semantic",
  );

describe("smart block capabilities", () => {
  it.each(["if true", "loop $x of [1]", 'def test ""'])(
    "rejects a smart block on %s before its body runs",
    async (command) => {
      const script = `${command} !(\nprint "body ran"\n)`;
      const logs: string[] = [];
      const interpreter = new Interpreter(tag.registry, {
        account,
        chainId: 1,
        onLog: (line) => logs.push(line),
      });
      expect(
        (await diagnostics(script)).some(
          (d) => d.code === "unsupported-smart-block",
        ),
      ).toBe(true);
      await expect(interpreter.interpret(script)).rejects.toThrow(
        "does not accept a smart block",
      );
      expect(logs).toEqual([]);
    },
  );
  it("matches each block to its own definition, including unions", async () => {
    const prefix = "load blocktest\nblocktest:pair ";
    const interpreter = new Interpreter(tag.registry, { account, chainId: 1 });
    const allowed = `${prefix}!(\nprint 1\n) (\nprint 2\n)`;
    expect(await diagnostics(allowed)).toEqual([]);
    await interpreter.interpret(allowed);
    const before = runs;
    const unsupported = `${prefix}(\nprint 1\n) !(\nprint 2\n)`;
    expect(
      (await diagnostics(unsupported)).find(
        (d) => d.code === "unsupported-smart-block",
      )?.message,
    ).toContain("<body>");
    await expect(
      new Interpreter(tag.registry, { account, chainId: 1 }).interpret(
        unsupported,
      ),
    ).rejects.toThrow("<body>");
    expect(runs).toBe(before);
  });
  it("allows bangs in user-defined command names", async () => {
    await expect(
      new Interpreter(tag.registry, { account, chainId: 1 }).interpret(
        'def custom! "" (\nset $x 1\n)\ncustom!',
      ),
    ).resolves.toEqual([]);
  });
  it("offers smart snippets only on capable arguments", async () => {
    const workspace = tag.workspace();
    const labels = async (script: string) =>
      (
        await workspace.getCompletions(script, {
          line: script.split("\n").length,
          col: script.split("\n").at(-1)!.length,
        })
      ).map((item) => item.label);
    expect(await labels("batch ")).toContain("!( ... )");
    expect(await labels("if true ")).not.toContain("!( ... )");
    expect(await labels("load blocktest\nblocktest:pair ")).toContain(
      "!( ... )",
    );
    expect(await labels("")).not.toContain("batch!");
  });
});
