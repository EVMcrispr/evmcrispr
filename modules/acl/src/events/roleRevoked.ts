import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";
import { lastBy } from "./_shared";

export default defineEvent({
  name: "roleRevoked",
  description:
    "AccessControl: an account no longer holds the role revoked from it.",
  event:
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  suggest: async (env, { emitter, logs }) => {
    const target = await contract(env, emitter, "contract");
    const out = [];
    for (const { role, account: address } of lastBy(
      logs,
      (l) => `${l.role}:${l.account}`,
    )) {
      const who = account(address, "account");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function hasRole(bytes32,address) view returns (bool)",
            args: [role, who.address],
            expect: false,
          },
          line`assert @acl:hasRole!(${target} ${role} ${who}) == false`,
          say`${who} no longer holds the role revoked on ${target}`,
        )),
      );
    }
    return out;
  },
});
