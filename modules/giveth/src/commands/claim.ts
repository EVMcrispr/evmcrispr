import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givpowerAbi, tokenDistroAbi } from "../abis";
import { GIVPOWER, TOKEN_DISTRO } from "../addresses";

export default defineCommand<Giveth>({
  name: "claim",
  description:
    "Harvest GIV rewards: collect the accrued GIVpower staking rewards into the GIVstream (when the chain has a staking contract) and claim the GIV the GIVstream has already released.",
  args: [],
  async run(module) {
    const chainId = await module.getChainId();
    const distro = TOKEN_DISTRO[chainId];
    if (!distro) {
      throw new ErrorException(
        `the GIVstream is not deployed on chain ${chainId} (available on Mainnet, Gnosis, Optimism and Polygon zkEVM)`,
      );
    }
    const account = await module.getConnectedAccount(true);
    const client = await module.getClient();

    const actions = [];
    const lm = GIVPOWER[chainId]?.lm;
    let earned = 0n;
    if (lm) {
      earned = await client.readContract({
        address: lm,
        abi: givpowerAbi,
        functionName: "earned",
        args: [account],
      });
      if (earned > 0n) {
        actions.push(encodeAction(lm, "getReward()", []));
      }
    }

    const claimable = await client.readContract({
      address: distro,
      abi: tokenDistroAbi,
      functionName: "claimableNow",
      args: [account],
    });
    if (claimable > 0n || earned > 0n) {
      actions.push(encodeAction(distro, "claim()", []));
    }

    if (actions.length === 0) {
      throw new ErrorException("nothing to claim");
    }
    return actions;
  },
});
