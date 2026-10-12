import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";
import { events } from "../../src/_generated";

const TARGET = getAddress("0x0000000000000000000000000000000000005d01");
const WHO = getAddress("0x0000000000000000000000000000000000005d02");
const bool = (value: boolean) =>
  encodeAbiParameters([{ type: "bool" }], [value]);

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what std events suggest runs as a script and holds against the views read", async () => {
  const paused = await suggestionsHold(
    "std",
    events,
    [eventLog("event Paused(address account)", TARGET, { account: WHO })],
    { [TARGET]: { "paused()": bool(true) } },
  );
  const unpaused = await suggestionsHold(
    "std",
    events,
    [eventLog("event Unpaused(address account)", TARGET, { account: WHO })],
    { [TARGET]: { "paused()": bool(false) } },
  );
  expect(shown([...paused, ...unpaused])).toMatchInlineSnapshot(`
    "paused
      assert $contract::!{paused()(bool)} == true
      0x0000...5d01 is paused
    unpaused
      assert $contract::!{paused()(bool)} == false
      0x0000...5d01 is not paused"
  `);
}, 180000);
