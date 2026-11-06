import "../setup";
import { describe, expect, it } from "bun:test";
import { chainLabel } from "@evmcrispr/sdk";
import { createInterpreter } from "@evmcrispr/test-utils/evml";

const DEVNET_ID = 1337;

describe("frame > alt-mempool devnet chain", () => {
  for (const target of ["altMempool", "1337"]) {
    it(`switch ${target} reaches the devnet`, async () => {
      const interpreter = createInterpreter(
        `switch ${target}`,
        undefined as never,
        { chainId: 1 },
      );
      await interpreter.interpret();
      expect(await interpreter.evm.getChainId()).toBe(DEVNET_ID);
    });
  }

  it("names the chain", () => {
    expect(chainLabel(DEVNET_ID)).toBe("Alt-mempool devnet");
  });
});
