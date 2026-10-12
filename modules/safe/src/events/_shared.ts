import {
  type Candidate,
  type EventLogs,
  type SuggestEnv,
  sameValue,
  stateCandidate,
  truncateAddress,
} from "@evmcrispr/sdk";
import { getAddress, keccak256, toHex } from "viem";

const lastBy = <T>(logs: T[], key: (l: T) => string) => [
  ...new Map(logs.map((l) => [key(l), l])).values(),
];

export const ownerCheck =
  (isOwner: boolean) =>
  async (env: SuggestEnv, { emitter, logs }: EventLogs) => {
    const out: Candidate[] = [];
    for (const { owner } of lastBy(logs, (l) => l.owner)) {
      const who = getAddress(owner);
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function isOwner(address) view returns (bool)",
            args: [who],
            expect: isOwner,
          },
          `assert @safe:isOwner!(${who} ${emitter}) == ${isOwner}`,
          `${truncateAddress(who)} is ${isOwner ? "" : "no longer "}an owner of ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  };

export const moduleCheck =
  (enabled: boolean) =>
  async (env: SuggestEnv, { emitter, logs }: EventLogs) => {
    const out: Candidate[] = [];
    for (const { module } of lastBy(logs, (l) => l.module)) {
      const address = getAddress(module);
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function isModuleEnabled(address) view returns (bool)",
            args: [address],
            expect: enabled,
          },
          `assert ${emitter}::!{isModuleEnabled(address)(bool) ${address}} == ${enabled}`,
          `The module ${truncateAddress(address)} is ${enabled ? "enabled" : "disabled"} on ${truncateAddress(emitter)}`,
        )),
      );
    }
    return out;
  };

const GUARD_SLOT = BigInt(keccak256(toHex("guard_manager.guard.address")));

/** The guard has no getter: it is read from its storage slot through the
 *  Safe's own `getStorageAt`, as `@safe:guard!` does. */
export const guardCheck = async (
  env: SuggestEnv,
  { emitter, logs }: EventLogs,
): Promise<Candidate[]> => {
  const guard = getAddress(logs.at(-1)!.guard);
  const stored = await env.read(
    emitter,
    "function getStorageAt(uint256,uint256) view returns (bytes)",
    [GUARD_SLOT, 1n],
  );
  if (typeof stored !== "string" || !sameValue(`0x${stored.slice(-40)}`, guard))
    return [];
  return [
    {
      line: `assert @safe:guard!(${emitter}) == ${guard}`,
      description: `${truncateAddress(emitter)} is guarded by ${truncateAddress(guard)}`,
      kind: "state",
    },
  ];
};
