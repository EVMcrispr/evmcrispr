import "../setup";
import { expect, test } from "bun:test";
import {
  eventLog,
  mockedEnv,
  suggested,
  suggestionsHold,
} from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";
import { events } from "../../src/_generated";

const SAFE = getAddress("0x00000000000000000000000000000000005afe01");
const WHO = getAddress("0x00000000000000000000000000000000005afe02");
const MODULE = getAddress("0x00000000000000000000000000000000005afe03");
const GUARD = getAddress("0x00000000000000000000000000000000005afe04");
const bool = (value: boolean) =>
  encodeAbiParameters([{ type: "bool" }], [value]);
const views = (answer: boolean) => ({
  "isOwner(address)": bool(answer),
  "isModuleEnabled(address)": bool(answer),
  "getThreshold()": encodeAbiParameters([{ type: "uint256" }], [2n]),
  "getStorageAt(uint256,uint256)": encodeAbiParameters(
    [{ type: "bytes" }],
    [encodeAbiParameters([{ type: "address" }], [GUARD])],
  ),
});

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what safe events suggest runs as a script and holds against the views read", async () => {
  // Each event in both its layouts: 1.3.0, and indexed from 1.4.1 on. They
  // say the same thing, so one line comes of the two.
  const both = (name: string, arg: string, address: `0x${string}`) => [
    eventLog(`event ${name}(address ${arg})`, SAFE, { [arg]: address }),
    eventLog(`event ${name}(address indexed ${arg})`, SAFE, { [arg]: address }),
  ];
  const added = await suggestionsHold(
    "safe",
    events,
    [
      ...both("AddedOwner", "owner", WHO),
      ...both("EnabledModule", "module", MODULE),
      ...both("ChangedGuard", "guard", GUARD),
      eventLog("event ChangedThreshold(uint256 threshold)", SAFE, {
        threshold: 2n,
      }),
    ],
    { [SAFE]: views(true) },
  );
  expect(shown(added)).toMatchInlineSnapshot(`
    "addedOwner
      assert @safe:isOwner!($owner $contract) == true
      0x0000...fe02 is an owner of 0x0000...FE01
    changedGuard
      assert @safe:guard!($contract) == $guard
      0x0000...FE01 is guarded by 0x0000...fE04
    changedThreshold
      assert @safe:threshold!($contract) == 2
      0x0000...FE01 has a threshold of 2
    enabledModule
      assert $contract::!{isModuleEnabled(address)(bool) $module} == true
      The module 0x0000...fE03 is enabled on 0x0000...FE01"
  `);
  const removed = await suggestionsHold(
    "safe",
    events,
    [
      ...both("RemovedOwner", "owner", WHO),
      ...both("DisabledModule", "module", MODULE),
    ],
    { [SAFE]: views(false) },
  );
  expect(shown(removed)).toMatchInlineSnapshot(`
    "disabledModule
      assert $contract::!{isModuleEnabled(address)(bool) $module} == false
      The module 0x0000...fE03 is disabled on 0x0000...FE01
    removedOwner
      assert @safe:isOwner!($owner $contract) == false
      0x0000...fe02 is no longer an owner of 0x0000...FE01"
  `);
}, 180000);

test("a delegatecall from a Safe suggests everything that decides who controls it", async () => {
  const OTHER = getAddress("0x00000000000000000000000000000000005afe05");
  const out = await suggestionsHold(
    "safe",
    events,
    [
      eventLog("event SimulatedDelegatecall(address indexed target)", SAFE, {
        target: OTHER,
      }),
    ],
    {
      [SAFE]: {
        ...views(true),
        "getOwners()": encodeAbiParameters([{ type: "address[]" }], [[WHO]]),
        "getModulesPaginated(address,uint256)": encodeAbiParameters(
          [{ type: "address[]" }, { type: "address" }],
          [[MODULE], "0x0000000000000000000000000000000000000001"],
        ),
        "VERSION()": encodeAbiParameters([{ type: "string" }], ["1.5.0"]),
      },
    },
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "simulatedDelegatecall
      assert @safe:threshold!($contract) == 2
      0x0000...FE01 still needs 2 signatures
    simulatedDelegatecall
      assert @lang:len!(@safe:owners!($contract)) == 1
      0x0000...FE01 has 1 owner
    simulatedDelegatecall
      assert @safe:isOwner!($owner $contract) == true
      0x0000...fe02 is an owner of 0x0000...FE01
    simulatedDelegatecall
      assert @lang:len!(@safe:modules!($contract)) == 1
      0x0000...FE01 has 1 module enabled
    simulatedDelegatecall
      assert $contract::!{isModuleEnabled(address)(bool) $module} == true
      The module 0x0000...fE03 is enabled on 0x0000...FE01
    simulatedDelegatecall
      assert @safe:guard!($contract) == $account
      0x0000...FE01 is guarded by 0x0000...fE04
    simulatedDelegatecall
      assert @safe:guard!($contract module:true) == $account
      0x0000...FE01's modules are guarded by 0x0000...fE04
    simulatedDelegatecall
      assert @safe:singleton!($contract) == $account
      0x0000...FE01 runs the code at 0x0000...fE04
    simulatedDelegatecall
      assert @safe:fallbackHandler!($contract) == $account
      0x0000...FE01's fallback handler is 0x0000...fE04"
  `);
}, 180000);

test("a delegatecall from an account that is no Safe suggests nothing of it", async () => {
  const out = await suggested({
    modules: [{ name: "safe", events }],
    logs: [
      eventLog("event SimulatedDelegatecall(address indexed target)", SAFE, {
        target: WHO,
      }),
    ],
    env: mockedEnv({ [SAFE]: {} }),
  });
  expect(out).toEqual([]);
});
