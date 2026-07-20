import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givpowerAbi, tokenDistroAbi } from "../abis";
import { GIVPOWER } from "../addresses";
import { requireDistro } from "../utils/givpower";
import { recordVirtual } from "../utils/ledger";

export default defineCommand<Giveth>({
  name: "claim",
  description:
    "Harvest GIV rewards: collect the accrued GIVpower staking rewards into the GIVstream (when the chain has a staking contract) and claim the GIV the GIVstream has already released. Does nothing when there is nothing to claim.",
  args: [],
  async run(module, _, { interpreters }) {
    const distro = await requireDistro(module);
    const chainId = await module.getChainId();
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

    // The wallet also receives the slice of `earned` the GIVstream releases
    // on harvest; only the already-released `claimable` is recorded, so the
    // virtual balances underestimate — the safe direction for `max`.
    recordVirtual(module, interpreters, chainId, account, {
      claimed: claimable,
      giv: claimable,
    });
    return actions;
  },
});
