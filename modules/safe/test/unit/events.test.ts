import "../setup";
import { describe, expect, it } from "bun:test";
import {
  eventLog,
  literalLine,
  suggestEnv,
  suggested,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const SAFE = getAddress("0x00000000000000000000000000000000005afe01");
const WHO = getAddress("0x00000000000000000000000000000000005afe02");
const GUARD_SLOT = BigInt(keccak256(toHex("guard_manager.guard.address")));
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await suggested({
      modules: [{ name: "safe", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map(literalLine);

describe("safe events", () => {
  for (const [sig, arg] of [
    ["event AddedOwner(address owner)", "owner"],
    ["event AddedOwner(address indexed owner)", "owner"],
  ] as const) {
    it(`${sig}: the owner is an owner`, async () => {
      const log = eventLog(sig, SAFE, { [arg]: WHO });
      expect(
        await lines([log], { [viewKey(SAFE, "isOwner", WHO)]: true }),
      ).toEqual([`assert @safe:isOwner!(${WHO} ${SAFE}) == true`]);
      expect(
        await lines([log], { [viewKey(SAFE, "isOwner", WHO)]: false }),
      ).toEqual([]);
    });
  }

  for (const sig of [
    "event RemovedOwner(address owner)",
    "event RemovedOwner(address indexed owner)",
  ]) {
    it(`${sig}: the owner is no longer an owner`, async () => {
      expect(
        await lines([eventLog(sig, SAFE, { owner: WHO })], {
          [viewKey(SAFE, "isOwner", WHO)]: false,
        }),
      ).toEqual([`assert @safe:isOwner!(${WHO} ${SAFE}) == false`]);
    });
  }

  it("event ChangedThreshold(uint256 threshold): the threshold", async () => {
    expect(
      await lines(
        [
          eventLog("event ChangedThreshold(uint256 threshold)", SAFE, {
            threshold: 2n,
          }),
        ],
        { [viewKey(SAFE, "getThreshold")]: 2n },
      ),
    ).toEqual([`assert @safe:threshold!(${SAFE}) == 2`]);
  });

  for (const [sig, enabled] of [
    ["event EnabledModule(address module)", true],
    ["event EnabledModule(address indexed module)", true],
    ["event DisabledModule(address module)", false],
    ["event DisabledModule(address indexed module)", false],
  ] as const) {
    it(`${sig}: isModuleEnabled`, async () => {
      expect(
        await lines([eventLog(sig, SAFE, { module: WHO })], {
          [viewKey(SAFE, "isModuleEnabled", WHO)]: enabled,
        }),
      ).toEqual([
        `assert ${SAFE}::!{isModuleEnabled(address)(bool) ${WHO}} == ${enabled}`,
      ]);
    });
  }

  for (const sig of [
    "event ChangedGuard(address guard)",
    "event ChangedGuard(address indexed guard)",
  ]) {
    it(`${sig}: the guard slot`, async () => {
      const slotValue = encodeAbiParameters([{ type: "address" }], [WHO]);
      expect(
        await lines([eventLog(sig, SAFE, { guard: WHO })], {
          [viewKey(SAFE, "getStorageAt", GUARD_SLOT, 1n)]: slotValue,
        }),
      ).toEqual([`assert @safe:guard!(${SAFE}) == ${WHO}`]);
    });
  }

  it("event SimulatedDelegatecall(address indexed target): who controls the Safe", async () => {
    const word = (address: string) =>
      encodeAbiParameters([{ type: "address" }], [address as `0x${string}`]);
    const slot = (name: string) => BigInt(keccak256(toHex(name)));
    const MODULE = getAddress("0x00000000000000000000000000000000005afe03");
    const SINGLETON = getAddress("0x00000000000000000000000000000000005afe04");
    const HANDLER = getAddress("0x00000000000000000000000000000000005afe05");
    const log = eventLog(
      "event SimulatedDelegatecall(address indexed target)",
      SAFE,
      { target: WHO },
    );
    const answers = {
      [viewKey(SAFE, "getThreshold")]: 1n,
      [viewKey(SAFE, "getOwners")]: [WHO],
      [viewKey(
        SAFE,
        "getModulesPaginated",
        "0x0000000000000000000000000000000000000001",
        100n,
      )]: [[MODULE], "0x0000000000000000000000000000000000000001"],
      [viewKey(SAFE, "getStorageAt", GUARD_SLOT, 1n)]: word(
        "0x0000000000000000000000000000000000000000",
      ),
      [viewKey(SAFE, "getStorageAt", 0n, 1n)]: word(SINGLETON),
      [viewKey(
        SAFE,
        "getStorageAt",
        slot("fallback_manager.handler.address"),
        1n,
      )]: word(HANDLER),
      [viewKey(SAFE, "VERSION")]: "1.3.0",
    };
    expect(await lines([log], answers)).toEqual([
      `assert @safe:threshold!(${SAFE}) == 1`,
      `assert @lang:len!(@safe:owners!(${SAFE})) == 1`,
      `assert @safe:isOwner!(${WHO} ${SAFE}) == true`,
      `assert @lang:len!(@safe:modules!(${SAFE})) == 1`,
      `assert ${SAFE}::!{isModuleEnabled(address)(bool) ${MODULE}} == true`,
      `assert @safe:guard!(${SAFE}) == 0x0000000000000000000000000000000000000000`,
      `assert @safe:singleton!(${SAFE}) == ${SINGLETON}`,
      `assert @safe:fallbackHandler!(${SAFE}) == ${HANDLER}`,
    ]);
    // An account that answers no Safe view is no Safe.
    expect(await lines([log], {})).toEqual([]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
