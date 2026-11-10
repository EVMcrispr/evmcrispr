import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { toHex } from "viem";
import { devnet, L1_ID, l1 } from "../../devnet";

/** Fresh recipient per run: its balance starts at zero. */
const recipient: `0x${string}` = `0x${toHex(BigInt(Date.now()) + 7n, { size: 20 }).slice(2)}`;

/** The hosted testnet has no pre-funded key, so the faucet is pointed at
 *  the key that funds the devnet tests on Chiado, and sends dust. */
const FUNDED_KEY = process.env.EEZ_DEVNET_FUNDER_KEY ?? "";

describeCommand("faucet", {
  module: "eez",
  preamble: `load eez\nset $eez:faucetKey ${FUNDED_KEY}`,
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "funds a fresh account from the key in $eez:faucetKey",
      script: `eez:faucet ${recipient} --amount 1e12`,
      timeout: 120_000,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(0);
        const balance = await l1.getBalance({ address: recipient });
        expect(balance).to.equal(10n ** 12n);
      },
    },
  ],
  docCases: [
    {
      description:
        "Top up the connected wallet from the key set in $eez:faucetKey",
      code: "eez:faucet @me --amount 1e12",
      preamble: `load eez\nset $eez:faucetKey ${FUNDED_KEY}`,
      timeout: 120_000,
    },
  ],
});

describeCommand("faucet", {
  module: "eez",
  preamble: "load eez",
  describeName: "Eez > commands > faucet (no faucet key)",
  errorCases: [
    {
      name: "explains that a chain without a known key has no faucet",
      script: `eez:faucet ${recipient}`,
      error: "has no faucet",
    },
  ],
});
