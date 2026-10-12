import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "granted",
  description: "Aragon OSx: a granted permission is in force.",
  event:
    "event Granted(bytes32 indexed permissionId, address indexed here, address where, address indexed who, address condition)",
  suggest: async (env, { emitter, logs }) => {
    const manager = await contract(env, emitter, "contract");
    const last = new Map(
      logs.map((l) => [`${l.permissionId}:${l.where}:${l.who}`, l]),
    );
    const out = [];
    for (const { permissionId, where, who } of last.values()) {
      const target = account(where, "target");
      const holder = account(who, "holder");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function isGranted(address,address,bytes32,bytes) view returns (bool)",
            args: [target.address, holder.address, permissionId, "0x"],
            expect: true,
          },
          line`assert ${manager}::!{isGranted(address,address,bytes32,bytes)(bool) ${target} ${holder} ${permissionId} 0x} == true`,
          say`${holder} has the permission on ${target}`,
        )),
      );
    }
    return out;
  },
});
