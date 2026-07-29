import "../setup";
import { describe, expect, it } from "bun:test";
import { TestContext } from "@evmcrispr/test-utils/evml";
import { parseScript } from "../../src/parsers/script";

describe("probe", () => {
  const ctx = new TestContext();
  it("parses + prewarms representative set statements", async () => {
    const evm = ctx.createWorkspace();
    const scripts = [
      "set $n 42",
      "set $eth 1e18",
      "set $wei 1eth",
      "set $delay 1d",
      "set $arr [1 2 3]",
      "set $sum @num(1 + 2)",
    ];
    for (const s of scripts) {
      const ast = parseScript(s).ast;
      const cmds = ast.getCommandsUntilLine(99, ["set"]);
      expect(cmds).toHaveLength(1);
      expect(cmds[0].args.length).toBeGreaterThanOrEqual(2);
      await evm.prewarm(s);
    }
  });
});
