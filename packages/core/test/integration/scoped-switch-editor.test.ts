import "../setup";
import { describe, it } from "bun:test";
import { defineCommand, fieldItem } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { TestContext } from "@evmcrispr/test-utils/evml";
import { evml, Module, type ModuleContext } from "../../src";

// A module that shows which chain the editor is on at a point of a
// script: `scopeprobe:at <cursor>` completes to `chain-<id>`, and
// `@scopeprobe:chain()` evaluates to the id (hover shows it on a variable).
class ScopeProbeModule extends Module {
  constructor(context: ModuleContext, alias?: string) {
    super(
      "scopeprobe",
      {
        at: defineCommand({
          name: "at",
          args: [{ name: "where", type: "probechain" }],
          run: async () => [],
        }),
      },
      { chain: async (module) => String(await module.getChainId()) },
      { chain: "string" },
      { chain: false },
      { chain: [] },
      { chain: "The active chain id." },
      {},
      {},
      {
        probechain: {
          validate() {},
          completions: (ctx) => [fieldItem(`chain-${ctx.chainId}`)],
        },
      },
      context,
      alias,
    );
  }
}
evml.use({
  name: "scopeprobe",
  load: async () => ({ default: ScopeProbeModule }),
});

describe("Editor > the chain around a scoped switch", () => {
  const ctx = new TestContext();

  /** The chain `scopeprobe:at ` completes to on the cursor line. */
  const chainAt = async (lines: string[], line: number) => {
    const script = lines.join("\n");
    const items = await ctx
      .createWorkspace()
      .getCompletions(script, { line, col: lines[line - 1].length });
    return items
      .map((i) => i.label)
      .filter((label) => label.startsWith("chain-"));
  };

  describe("completions (cold walk)", () => {
    it("inside a block, after its bare switch: the switched chain", async () => {
      expect(
        await chainAt(
          [
            "load scopeprobe",
            "if true (",
            "  switch optimism",
            "  scopeprobe:at ",
            ")",
          ],
          4,
        ),
      ).to.eql(["chain-10"]);
    });

    it("inside a block, before its bare switch: the outer chain", async () => {
      expect(
        await chainAt(
          [
            "load scopeprobe",
            "if true (",
            "  scopeprobe:at ",
            "  switch optimism",
            ")",
          ],
          3,
        ),
      ).to.eql(["chain-100"]);
    });

    it("after a block that held a bare switch: the outer chain", async () => {
      expect(
        await chainAt(
          [
            "load scopeprobe",
            "if true (",
            "  switch optimism",
            "  print 1",
            ")",
            "scopeprobe:at ",
          ],
          6,
        ),
      ).to.eql(["chain-100"]);
    });

    it("inside a block-form switch: its chain", async () => {
      expect(
        await chainAt(
          ["load scopeprobe", "switch optimism (", "  scopeprobe:at ", ")"],
          3,
        ),
      ).to.eql(["chain-10"]);
    });

    it("after a block-form switch: the outer chain", async () => {
      expect(
        await chainAt(
          [
            "load scopeprobe",
            "switch optimism (",
            "  print 1",
            ")",
            "scopeprobe:at ",
          ],
          5,
        ),
      ).to.eql(["chain-100"]);
    });

    it("after a top-level bare switch: the switched chain", async () => {
      expect(
        await chainAt(
          ["load scopeprobe", "switch optimism", "scopeprobe:at "],
          3,
        ),
      ).to.eql(["chain-10"]);
    });
  });

  describe("prewarm (hover)", () => {
    const base = [
      "load scopeprobe [@chain]",
      "if true (",
      "  switch optimism",
      "  set $inIf @chain()",
      ")",
      "set $afterIf @chain()",
      "switch mainnet (",
      "  set $inSwitch @chain()",
      ")",
      "set $afterSwitch @chain()",
    ];
    const uses = [
      "print $inIf",
      "print $afterIf",
      "print $inSwitch",
      "print $afterSwitch",
    ];
    const expected = ["= 10", "= 100", "= 1", "= 100"];

    const valuesShown = async (
      evm: ReturnType<TestContext["createWorkspace"]>,
      lines: string[],
    ) => {
      const script = lines.join("\n");
      const first = lines.indexOf(uses[0]) + 1;
      const shown: string[] = [];
      for (let i = 0; i < uses.length; i++) {
        const card = await evm.getHoverInfo(script, {
          line: first + i,
          col: 7,
        });
        const text = card?.contents.join("\n") ?? "";
        shown.push(text.match(/= \d+/)?.[0] ?? text);
      }
      return shown;
    };

    it("a cold walk gives each variable the chain of its line", async () => {
      const evm = ctx.createWorkspace();
      const lines = [...base, ...uses];
      await evm.prewarm(lines.join("\n"));
      expect(await valuesShown(evm, lines)).to.eql(expected);
    });

    it("an incremental walk that resumes inside and after the blocks agrees", async () => {
      const evm = ctx.createWorkspace();
      // First the script up to the middle of the first block, then grown
      // line by line: each prewarm reuses the previous one's prefix.
      for (let n = 4; n <= base.length; n++) {
        await evm.prewarm(base.slice(0, n).join("\n"));
      }
      const lines = [...base, ...uses];
      await evm.prewarm(lines.join("\n"));
      expect(await valuesShown(evm, lines)).to.eql(expected);
    });
  });
});
