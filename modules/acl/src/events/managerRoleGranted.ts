import { defineEvent, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { firstWordCandidate, lastBy } from "./_shared";

export default defineEvent({
  name: "managerRoleGranted",
  description:
    "AccessManager: an account is a member of the role it was granted.",
  event:
    "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, bool newMember)",
  suggest: async (env, { emitter, logs }) => {
    const out = [];
    for (const { roleId, account } of lastBy(
      logs,
      (l) => `${l.roleId}:${l.account}`,
    )) {
      const who = getAddress(account);
      out.push(
        ...(await firstWordCandidate(
          env,
          {
            address: emitter,
            signature:
              "function hasRole(uint64,address) view returns (bool, uint32)",
            args: [roleId, who],
            expect: true,
          },
          `assert @acl:hasRole!(${emitter} ${roleId} ${who}) == true`,
          `${truncateAddress(who)} is a member of role ${roleId} on ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  },
});
