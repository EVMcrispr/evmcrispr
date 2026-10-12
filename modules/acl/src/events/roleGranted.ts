import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { lastBy } from "./_shared";

export default defineEvent({
  name: "roleGranted",
  description: "AccessControl: an account holds the role it was granted.",
  event:
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
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
            expect: true,
          },
          `assert @acl:hasRole!(${emitter} ${role} ${who}) == true`,
          `${truncateAddress(who)} holds the role it was granted on ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  },
});
