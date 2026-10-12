import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "revoked",
  description: "Aragon OSx: a revoked permission is no longer in force.",
  event:
    "event Revoked(bytes32 indexed permissionId, address indexed here, address where, address indexed who)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map(
      logs.map((l) => [`${l.permissionId}:${l.where}:${l.who}`, l]),
    );
    const out = [];
    for (const { permissionId, where, who } of last.values()) {
      const target = getAddress(where);
      const holder = getAddress(who);
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function isGranted(address,address,bytes32,bytes) view returns (bool)",
            args: [target, holder, permissionId, "0x"],
            expect: false,
          },
          `assert ${emitter}::!{isGranted(address,address,bytes32,bytes)(bool) ${target} ${holder} ${permissionId} 0x} == false`,
          `${truncateAddress(holder)} no longer has the permission on ${truncateAddress(target)}`,
        )),
      );
    }
    return out;
  },
});
