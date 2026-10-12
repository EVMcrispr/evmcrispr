import { account, contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { firstWordCandidate, lastBy } from "./_shared";

export default defineEvent({
  name: "managerRoleGranted",
  description:
    "AccessManager: an account is a member of the role it was granted.",
  event:
    "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, bool newMember)",
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
            expect: true,
          },
          line`assert @acl:hasRole!(${target} ${roleId} ${who}) == true`,
          say`${who} is a member of role ${roleId} on ${target}`,
        )),
      );
    }
    return out;
  },
});
