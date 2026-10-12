import { account, contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { firstWordCandidate } from "./_shared";

export default defineEvent({
  name: "defaultAdminTransferScheduled",
  description: "AccessControlDefaultAdminRules: the pending default admin.",
  event:
    "event DefaultAdminTransferScheduled(address indexed newAdmin, uint48 acceptSchedule)",
  suggest: async (env, { emitter, logs }) => {
    const admin = account(logs.at(-1)!.newAdmin, "pendingAdmin");
    const target = await contract(env, emitter, "contract");
    return firstWordCandidate(
      env,
      {
        address: emitter,
        signature:
          "function pendingDefaultAdmin() view returns (address, uint48)",
        expect: admin.address,
      },
      line`assert @acl:pendingDefaultAdmin!(${target}) == ${admin}`,
      say`${admin} is the pending default admin of ${target}`,
    );
  },
});
