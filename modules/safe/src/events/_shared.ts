import {
  account,
  type Candidate,
  contract,
  type EventLogs,
  line,
  type SuggestEnv,
  sameValue,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";

const lastBy = <T>(logs: T[], key: (l: T) => string) => [
  ...new Map(logs.map((l) => [key(l), l])).values(),
];

export const ownerCheck =
  (isOwner: boolean) =>
  async (env: SuggestEnv, { emitter, logs }: EventLogs) => {
    const target = await contract(env, emitter, "contract");
    const out: Candidate[] = [];
    for (const { owner } of lastBy(logs, (l) => l.owner)) {
      const who = account(owner, "owner");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function isOwner(address) view returns (bool)",
            args: [who.address],
            expect: isOwner,
          },
          line`assert @safe:isOwner!(${who} ${target}) == ${isOwner}`,
          say`${who} is ${isOwner ? "" : "no longer "}an owner of ${target}`,
        )),
      );
    }
    return out;
  };

export const moduleCheck =
  (enabled: boolean) =>
  async (env: SuggestEnv, { emitter, logs }: EventLogs) => {
    const target = await contract(env, emitter, "contract");
    const out: Candidate[] = [];
    for (const { module: address } of lastBy(logs, (l) => l.module)) {
      const module = account(address, "module");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function isModuleEnabled(address) view returns (bool)",
            args: [module.address],
            expect: enabled,
          },
          line`assert ${target}::!{isModuleEnabled(address)(bool) ${module}} == ${enabled}`,
          say`The module ${module} is ${enabled ? "enabled" : "disabled"} on ${target}`,
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
  const guard = account(logs.at(-1)!.guard, "guard");
  const stored = await env.read(
    emitter,
    "function getStorageAt(uint256,uint256) view returns (bytes)",
    [GUARD_SLOT, 1n],
  );
  if (
    typeof stored !== "string" ||
    !sameValue(`0x${stored.slice(-40)}`, guard.address)
  )
    return [];
  const target = await contract(env, emitter, "contract");
  return [
    {
      line: line`assert @safe:guard!(${target}) == ${guard}`,
      sentence: say`${target} is guarded by ${guard}`,
      kind: "state",
    },
  ];
};
