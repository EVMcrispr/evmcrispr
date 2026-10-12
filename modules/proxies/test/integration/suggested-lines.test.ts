import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";
import { events } from "../../src/_generated";

const PROXY = getAddress("0x0000000000000000000000000000000000009801");
const IMPL = getAddress("0x0000000000000000000000000000000000009802");
const ADMIN = getAddress("0x0000000000000000000000000000000000009803");
const BEACON = getAddress("0x0000000000000000000000000000000000009804");
const answer = (address: `0x${string}`) =>
  encodeAbiParameters([{ type: "address" }], [address]);

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what proxies events suggest runs as a script and holds against the views read", async () => {
  const out = await suggestionsHold(
    "proxies",
    events,
    [
      eventLog("event Upgraded(address indexed implementation)", PROXY, {
        implementation: IMPL,
      }),
      eventLog(
        "event AdminChanged(address previousAdmin, address newAdmin)",
        PROXY,
        { previousAdmin: PROXY, newAdmin: ADMIN },
      ),
      eventLog("event BeaconUpgraded(address indexed beacon)", PROXY, {
        beacon: BEACON,
      }),
    ],
    {
      [PROXY]: {
        "implementation()": answer(IMPL),
        "admin()": answer(ADMIN),
        "beacon()": answer(BEACON),
      },
    },
  );
  expect(new Set(out.map((s) => s.event))).toEqual(
    new Set(Object.keys(events)),
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "adminChanged
      assert @proxies:admin!($proxy) == $admin
      0x0000...9801 reports the admin 0x0000...9803
    beaconUpgraded
      assert @proxies:beacon!($proxy) == $beacon
      0x0000...9801 reports the beacon 0x0000...9804
    upgraded
      assert @proxies:implementation!($proxy) == $implementation
      0x0000...9801 reports the implementation 0x0000...9802"
  `);
}, 180000);
