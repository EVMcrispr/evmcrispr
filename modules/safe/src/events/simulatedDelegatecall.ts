import {
  account,
  type Candidate,
  contract,
  defineEvent,
  type LineTemplate,
  line,
  type SuggestEnv,
  say,
} from "@evmcrispr/sdk";
import { type Address, getAddress, zeroAddress } from "viem";
import {
  FALLBACK_HANDLER_STORAGE_SLOT,
  GUARD_STORAGE_SLOT,
  MODULE_GUARD_STORAGE_SLOT,
  SENTINEL,
  SINGLETON_STORAGE_SLOT,
} from "../addresses";

/** The address a Safe keeps in a storage slot, through its own
 *  `getStorageAt` view, as the `!` helpers read it. */
async function slotAddress(
  env: SuggestEnv,
  safe: Address,
  slot: `0x${string}`,
): Promise<Address | undefined> {
  const stored = await env.read(
    safe,
    "function getStorageAt(uint256,uint256) view returns (bytes)",
    [BigInt(slot), 1n],
  );
  if (typeof stored !== "string" || stored.length !== 66) return undefined;
  return getAddress(`0x${stored.slice(-40)}`);
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `<read> == <address>`, the address a variable for its role; the zero
 *  address, which every empty slot shares, is `$none`. */
const equalsAddress = (
  read: LineTemplate,
  address: Address,
  role: string,
): LineTemplate => [
  ...read,
  " == ",
  account(address, address === zeroAddress ? "none" : role),
];

/**
 * A delegatecall from a Safe runs foreign code on the Safe's storage: it can
 * add an owner, lower the threshold, enable a module, drop the guard or
 * repoint the proxy, all without an event. The simulator reports each
 * delegatecall (`SimulatedDelegatecall`), and this pins down everything that
 * decides who controls the Safe, as the run left it.
 */
export default defineEvent({
  name: "simulatedDelegatecall",
  description:
    "Safe: after a delegatecall, who controls the Safe is what the run left.",
  event: "event SimulatedDelegatecall(address indexed target)",
  suggest: async (env, { emitter }) => {
    const threshold = await env.read(
      emitter,
      "function getThreshold() view returns (uint256)",
    );
    // Not a Safe: nothing here is about it.
    if (typeof threshold !== "bigint") return [];
    const target = await contract(env, emitter, "contract");
    const out: Candidate[] = [
      {
        line: line`assert @safe:threshold!(${target}) == ${threshold}`,
        sentence: say`${target} still needs ${threshold} signatures`,
        kind: "state",
      },
    ];

    const owners = await env.read(
      emitter,
      "function getOwners() view returns (address[])",
    );
    if (Array.isArray(owners)) {
      out.push({
        line: line`assert @lang:len!(@safe:owners!(${target})) == ${owners.length}`,
        sentence: say`${target} has ${count(owners.length, "owner")}`,
        kind: "state",
      });
      for (const owner of owners as Address[]) {
        const who = account(owner, "owner");
        out.push({
          line: line`assert @safe:isOwner!(${who} ${target}) == true`,
          sentence: say`${who} is an owner of ${target}`,
          kind: "state",
        });
      }
    }

    // One page, as `@safe:modules!` reads it: a Safe with more modules
    // than that gets no module checks rather than partial ones.
    const page = await env.read(
      emitter,
      "function getModulesPaginated(address,uint256) view returns (address[],address)",
      [SENTINEL, 100n],
    );
    if (
      Array.isArray(page) &&
      Array.isArray(page[0]) &&
      (page[1] === SENTINEL || page[1] === zeroAddress)
    ) {
      const modules = page[0] as Address[];
      out.push({
        line: line`assert @lang:len!(@safe:modules!(${target})) == ${modules.length}`,
        sentence: say`${target} has ${count(modules.length, "module")} enabled`,
        kind: "state",
      });
      for (const address of modules) {
        const module = account(address, "module");
        out.push({
          line: line`assert ${target}::!{isModuleEnabled(address)(bool) ${module}} == true`,
          sentence: say`The module ${module} is enabled on ${target}`,
          kind: "state",
        });
      }
    }

    const guard = await slotAddress(env, emitter, GUARD_STORAGE_SLOT);
    if (guard)
      out.push({
        line: equalsAddress(
          line`assert @safe:guard!(${target})`,
          guard,
          "guard",
        ),
        sentence:
          guard === zeroAddress
            ? say`${target} has no guard`
            : say`${target} is guarded by ${account(guard, "guard")}`,
        kind: "state",
      });
    // The module guard exists from v1.5.0; below, its slot is not read.
    const version = await env.read(
      emitter,
      "function VERSION() view returns (string)",
    );
    if (typeof version === "string" && /^1\.(5|[6-9])\./.test(version)) {
      const moduleGuard = await slotAddress(
        env,
        emitter,
        MODULE_GUARD_STORAGE_SLOT,
      );
      if (moduleGuard)
        out.push({
          line: equalsAddress(
            line`assert @safe:guard!(${target} module:true)`,
            moduleGuard,
            "moduleGuard",
          ),
          sentence:
            moduleGuard === zeroAddress
              ? say`${target} has no module guard`
              : say`${target}'s modules are guarded by ${account(moduleGuard, "moduleGuard")}`,
          kind: "state",
        });
    }

    const singleton = await slotAddress(env, emitter, SINGLETON_STORAGE_SLOT);
    if (singleton && singleton !== zeroAddress)
      out.push({
        line: line`assert @safe:singleton!(${target}) == ${account(singleton, "singleton")}`,
        sentence: say`${target} runs the code at ${account(singleton, "singleton")}`,
        kind: "state",
      });
    const handler = await slotAddress(
      env,
      emitter,
      FALLBACK_HANDLER_STORAGE_SLOT,
    );
    if (handler)
      out.push({
        line: equalsAddress(
          line`assert @safe:fallbackHandler!(${target})`,
          handler,
          "fallbackHandler",
        ),
        sentence:
          handler === zeroAddress
            ? say`${target} has no fallback handler`
            : say`${target}'s fallback handler is ${account(handler, "fallbackHandler")}`,
        kind: "state",
      });
    return out;
  },
});
