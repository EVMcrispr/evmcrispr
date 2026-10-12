import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { lastBy } from "./_shared";

export default defineEvent({
  name: "roleRevoked",
  description:
    "AccessControl: an account no longer holds the role revoked from it.",
  event:
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  suggest: async (env, { emitter, logs }) => {
    const out = [];
    for (const { role, account } of lastBy(
      logs,
      (l) => `${l.role}:${l.account}`,
    )) {
      const who = getAddress(account);
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function hasRole(bytes32,address) view returns (bool)",
            args: [role, who],
            expect: false,
          },
          `assert @acl:hasRole!(${emitter} ${role} ${who}) == false`,
          `${truncateAddress(who)} no longer holds the role revoked on ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  },
});
