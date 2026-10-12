import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "setPermission",
  description: "aragonOS ACL: a permission is as it was set.",
  event:
    "event SetPermission(address indexed entity, address indexed app, bytes32 indexed role, bool allowed)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map(
      logs.map((l) => [`${l.entity}:${l.app}:${l.role}`, l]),
    );
    const out = [];
    for (const { entity, app, role, allowed } of last.values()) {
      const who = getAddress(entity);
      const where = getAddress(app);
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function hasPermission(address,address,bytes32) view returns (bool)",
            args: [who, where, role],
            expect: allowed,
          },
          `assert ${emitter}::!{hasPermission(address,address,bytes32)(bool) ${who} ${where} ${role}} == ${allowed}`,
          `${truncateAddress(who)} ${allowed ? "has" : "no longer has"} the permission on ${truncateAddress(where)}`,
        )),
      );
    }
    return out;
  },
});
