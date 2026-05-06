import "../setup";
import { describe, it } from "bun:test";
import { TestContext } from "@evmcrispr/test-utils/evml";
import { parseScript } from "../../src/parsers/script";

describe("probe", () => {
  const ctx = new TestContext();
  it("parses + walks", async () => {
    const evm = ctx.createEvm();
    const scripts = [
      "set $n 42",
      "set $eth 1e18",
      "set $wei 1eth",
      "set $delay 1d",
      "set $arr [1, 2, 3]",
      "set $sum @add(1 2)",
    ];
    for (const s of scripts) {
      console.error("===", s);
      try {
        const ast = parseScript(s).ast;
        const cmds = ast.getCommandsUntilLine(99, ["set"]);
        console.error(
          "  args:",
          JSON.stringify(cmds[0]?.args, null, 0).slice(0, 400),
        );
      } catch (e) {
        console.error("  PARSE FAIL:", (e as Error).message);
      }
      await evm.prewarm(s);
    }
  });
});
