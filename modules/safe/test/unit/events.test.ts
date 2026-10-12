import "../setup";
import { describe, expect, it } from "bun:test";
import { collectSuggestions } from "@evmcrispr/sdk";
import {
  eventLog,
  suggestEnv,
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
    await collectSuggestions({
      modules: [{ name: "safe", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map((s) => s.line);

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

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
