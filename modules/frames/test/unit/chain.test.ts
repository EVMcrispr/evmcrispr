import "../setup";
import { describe, expect, it } from "bun:test";
import { chainLabel } from "@evmcrispr/sdk";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { chains } from "../../src/chains";

describe("frame > chain 1337", () => {
  it("switch 1337 stays on chain 1337", async () => {
    const interpreter = createInterpreter("switch 1337", undefined as never, {
      chainId: 1,
    });
    await interpreter.interpret();
    expect(await interpreter.evm.getChainId()).toBe(1337);
  });

  it("the module declares no chain", () => {
    expect(chains).toEqual([]);
    expect(chainLabel(1337)).not.toBe("Alt-mempool devnet");
  });
});
