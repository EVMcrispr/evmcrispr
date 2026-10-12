import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "ownershipTransferred",
  description: "Ownable: the owner after the run.",
  event:
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  suggest: async (env, { emitter, logs }) => {
    const owner = getAddress(logs.at(-1)!.newOwner);
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function owner() view returns (address)",
        expect: owner,
      },
      `assert @acl:owner!(${emitter}) == ${owner}`,
      `${truncateAddress(emitter)} is owned by ${truncateAddress(owner)}`,
    );
  },
});
