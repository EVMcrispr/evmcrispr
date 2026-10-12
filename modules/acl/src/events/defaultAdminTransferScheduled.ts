import { defineEvent, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { firstWordCandidate } from "./_shared";

export default defineEvent({
  name: "defaultAdminTransferScheduled",
  description: "AccessControlDefaultAdminRules: the pending default admin.",
  event:
    "event DefaultAdminTransferScheduled(address indexed newAdmin, uint48 acceptSchedule)",
  suggest: async (env, { emitter, logs }) => {
    const admin = getAddress(logs.at(-1)!.newAdmin);
    return firstWordCandidate(
      env,
      {
        address: emitter,
        signature:
          "function pendingDefaultAdmin() view returns (address, uint48)",
        expect: admin,
      },
      `assert @acl:pendingDefaultAdmin!(${emitter}) == ${admin}`,
      `${truncateAddress(admin)} is the pending default admin of ${truncateAddress(emitter)}`,
    );
  },
});
