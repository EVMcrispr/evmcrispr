import "../setup";
import { describe, expect, it } from "bun:test";
import {
  eventLog,
  literalLine,
  suggestEnv,
  suggested,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { getAddress } from "viem";
import { events } from "../../src/_generated";

const TARGET = getAddress("0x0000000000000000000000000000000000005d01");
const WHO = getAddress("0x0000000000000000000000000000000000005d02");
const lines = async (sig: string, answers: Record<string, unknown>) =>
  (
    await suggested({
      modules: [{ name: "std", events }],
      logs: [eventLog(sig, TARGET, { account: WHO })],
      env: suggestEnv(answers),
    })
  ).map(literalLine);

describe("std events", () => {
  it("paused and unpaused are confirmed by paused()", async () => {
    expect(
      await lines("event Paused(address account)", {
        [viewKey(TARGET, "paused")]: true,
      }),
    ).toEqual([`assert ${TARGET}::!{paused()(bool)} == true`]);
    expect(
      await lines("event Unpaused(address account)", {
        [viewKey(TARGET, "paused")]: false,
      }),
    ).toEqual([`assert ${TARGET}::!{paused()(bool)} == false`]);
  });

  it("dropped when the contract has no paused() or disagrees", async () => {
    expect(await lines("event Paused(address account)", {})).toEqual([]);
    expect(
      await lines("event Paused(address account)", {
        [viewKey(TARGET, "paused")]: false,
      }),
    ).toEqual([]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
