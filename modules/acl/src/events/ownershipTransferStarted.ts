import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "ownershipTransferStarted",
  description: "Ownable2Step: the pending owner after the run.",
  event:
    "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  suggest: async (env, { emitter, logs }) => {
    const pendingOwner = account(logs.at(-1)!.newOwner, "pendingOwner");
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function pendingOwner() view returns (address)",
        expect: pendingOwner.address,
      },
      line`assert @acl:pendingOwner!(${target}) == ${pendingOwner}`,
      say`${pendingOwner} is the pending owner of ${target}`,
    );
  },
});
