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

// A frame transaction is simulated on an in-process backend of a frame
// network's fork (modules/frames/test/integration/simulate.test.ts). A fork
// of another chain, or a backend without the frames' opcodes, refuses it
// rather than end as if every frame had run.
for (const backend of BACKENDS) {
  describe(`Sim > frame transaction inside fork – ${backend.name}`, () => {
    it("is refused on a chain without frames, or a backend that cannot run them", async () => {
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
        backend.name !== "anvil"
          ? /Frame transactions run on the Alt-mempool devnet, the Frames quick devnet, the Frames mining devnet, the Frames alt-mempool devnet or the Hegota devnet, not on Gnosis: fork one of them to simulate this one/
          : /sim:fork simulates "Frame transaction from 0x[0-9a-fA-F]{40}" \(a frame action of the frames module\) only on an in-process backend: write --using ethereumjs or --using revm/,
      );
    }, 120000);
  });
}
