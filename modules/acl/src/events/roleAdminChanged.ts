import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";
import { lastBy } from "./_shared";

export default defineEvent({
  name: "roleAdminChanged",
  description: "AccessControl: the role that administers a role.",
  event:
    "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
  suggest: async (env, { emitter, logs }) => {
    const target = await contract(env, emitter, "contract");
    const out = [];
    for (const { role, newAdminRole } of lastBy(logs, (l) => l.role)) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function getRoleAdmin(bytes32) view returns (bytes32)",
            args: [role],
            expect: newAdminRole,
          },
          line`assert @acl:roleAdmin!(${target} ${role}) == ${newAdminRole}`,
          say`The admin role of a role on ${target} is the one that was set`,
        )),
      );
    }
    return out;
  },
});
