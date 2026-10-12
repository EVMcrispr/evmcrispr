import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "setPermission",
  description: "aragonOS ACL: a permission is as it was set.",
  event:
    "event SetPermission(address indexed entity, address indexed app, bytes32 indexed role, bool allowed)",
  suggest: async (env, { emitter, logs }) => {
    const acl = await contract(env, emitter, "contract");
    const last = new Map(
      logs.map((l) => [`${l.entity}:${l.app}:${l.role}`, l]),
    );
    const out = [];
    for (const { entity, app, role, allowed } of last.values()) {
      const who = account(entity, "entity");
      const where = account(app, "target");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function hasPermission(address,address,bytes32) view returns (bool)",
            args: [who.address, where.address, role],
            expect: allowed,
          },
          line`assert ${acl}::!{hasPermission(address,address,bytes32)(bool) ${who} ${where} ${role}} == ${allowed}`,
          say`${who} ${allowed ? "has" : "no longer has"} the permission on ${where}`,
        )),
      );
    }
    return out;
  },
});
