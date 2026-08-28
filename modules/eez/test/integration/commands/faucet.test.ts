import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { parseEther, toHex } from "viem";
import { devnet, L1_ID, l1 } from "../../devnet";

/** Fresh recipient per run: its balance starts at zero. */
const recipient: `0x${string}` = `0x${toHex(BigInt(Date.now()) + 7n, { size: 20 }).slice(2)}`;

describeCommand("faucet", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "funds a fresh account from the devnet faucet",
      script: `eez:faucet ${recipient} --amount 1e18`,
      timeout: 120_000,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(0);
        const balance = await l1.getBalance({ address: recipient });
        expect(balance).to.equal(parseEther("1"));
      },
    },
  ],
  docCases: [
    {
      description: "Give the connected wallet some devnet ETH for gas",
      code: "eez:faucet @me",
      // A real transfer: the receipt lands in the next 12s L1 slot.
      timeout: 120_000,
    },
  ],
});

describeCommand("faucet", {
  module: "eez",
  preamble: "load eez",
  describeName: "Eez > commands > faucet (non-EEZ chain)",
  errorCases: [
    {
      name: "explains that only devnets have a faucet",
      script: `eez:faucet ${recipient}`,
      error: "has no faucet",
    },
  ],
});
