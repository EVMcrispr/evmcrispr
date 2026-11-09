import "../../setup";
import { describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { getForkBlockNumber } from "../../../../../scripts/anvil-config";

const FORK_BLOCK_NUMBER = await getForkBlockNumber();
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const BACKENDS = [
  { name: "anvil", forkOpts: "--using anvil" },
  {
    name: "ethereumjs",
    forkOpts: `--using ethereumjs --block-number ${FORK_BLOCK_NUMBER}`,
  },
  {
    name: "revm",
    forkOpts: `--using revm --block-number ${FORK_BLOCK_NUMBER}`,
  },
] as const;

// No backend runs EIP-8141 frames yet. A frame action the fork does not
// handle would end the fork as if every frame had run, so it is refused.
for (const backend of BACKENDS) {
  describe(`Sim > frame transaction inside fork – ${backend.name}`, () => {
    it("is refused instead of skipped", async () => {
      const script = [
        "load sim",
        "load frames",
        `sim:fork ${backend.forkOpts} (`,
        "  frames:tx (",
        `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
        "  )",
        ")",
      ].join("\n");
      const refused = createInterpreter(script, getPublicClient()).interpret();
      // It says what it refuses (the module's own title for it) and why.
      await expect(refused).rejects.toThrow(
        /sim:fork cannot simulate "Frame transaction from 0x[0-9a-fA-F]{40}" \(a frame action of the frames module\) yet: no simulation backend runs it/,
      );
    }, 120000);
  });
}
