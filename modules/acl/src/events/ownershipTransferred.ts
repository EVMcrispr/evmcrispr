import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "ownershipTransferred",
  description: "Ownable: the owner after the run.",
  event:
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  suggest: async (env, { emitter, logs }) => {
    const owner = account(logs.at(-1)!.newOwner, "owner");
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function owner() view returns (address)",
        expect: owner.address,
      },
      line`assert @acl:owner!(${target}) == ${owner}`,
      say`${target} is owned by ${owner}`,
    );
  },
});
