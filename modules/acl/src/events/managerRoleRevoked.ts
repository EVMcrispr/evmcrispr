import { defineEvent, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { firstWordCandidate, lastBy } from "./_shared";

export default defineEvent({
  name: "managerRoleRevoked",
  description:
    "AccessManager: an account is no longer a member of the role revoked from it.",
  event: "event RoleRevoked(uint64 indexed roleId, address indexed account)",
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
            expect: false,
          },
          `assert @acl:hasRole!(${emitter} ${roleId} ${who}) == false`,
          `${truncateAddress(who)} is no longer a member of role ${roleId} on ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  },
});
