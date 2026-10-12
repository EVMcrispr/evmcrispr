import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "ownershipTransferStarted",
  description: "Ownable2Step: the pending owner after the run.",
  event:
    "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  suggest: async (env, { emitter, logs }) => {
    const owner = getAddress(logs.at(-1)!.newOwner);
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function pendingOwner() view returns (address)",
        expect: owner,
      },
      `assert @acl:pendingOwner!(${emitter}) == ${owner}`,
      `${truncateAddress(owner)} is the pending owner of ${truncateAddress(emitter)}`,
    );
  },
});
