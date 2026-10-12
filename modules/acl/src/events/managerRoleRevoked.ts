import { account, contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { firstWordCandidate, lastBy } from "./_shared";

export default defineEvent({
  name: "managerRoleRevoked",
  description:
    "AccessManager: an account is no longer a member of the role revoked from it.",
  event: "event RoleRevoked(uint64 indexed roleId, address indexed account)",
  suggest: async (env, { emitter, logs }) => {
    const target = await contract(env, emitter, "contract");
    const out = [];
    for (const { roleId, account: address } of lastBy(
      logs,
      (l) => `${l.roleId}:${l.account}`,
    )) {
      const who = account(address, "account");
      out.push(
        ...(await firstWordCandidate(
          env,
          {
            address: emitter,
            signature:
              "function hasRole(uint64,address) view returns (bool, uint32)",
            args: [roleId, who.address],
            expect: false,
          },
          line`assert @acl:hasRole!(${target} ${roleId} ${who}) == false`,
          say`${who} is no longer a member of role ${roleId} on ${target}`,
        )),
      );
    }
    return out;
  },
});
