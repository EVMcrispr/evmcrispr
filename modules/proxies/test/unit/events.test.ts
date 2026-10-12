import "../setup";
import { describe, expect, it } from "bun:test";
import { collectSuggestions } from "@evmcrispr/sdk";
import {
  eventLog,
  suggestEnv,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { getAddress } from "viem";
import { events } from "../../src/_generated";

const PROXY = getAddress("0x0000000000000000000000000000000000009801");
const IMPL = getAddress("0x0000000000000000000000000000000000009802");
const OTHER = getAddress("0x0000000000000000000000000000000000009803");
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await collectSuggestions({
      modules: [{ name: "proxies", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map((s) => s.line);

describe("proxies events", () => {
  const upgraded = eventLog(
    "event Upgraded(address indexed implementation)",
    PROXY,
    { implementation: IMPL },
  );

  it("an upgrade is confirmed where the emitter exposes implementation()", async () => {
    expect(
      await lines([upgraded], { [viewKey(PROXY, "implementation")]: IMPL }),
    ).toEqual([`assert @proxies:implementation!(${PROXY}) == ${IMPL}`]);
  });

  it("and dropped where it does not, or says otherwise", async () => {
    expect(await lines([upgraded], {})).toEqual([]);
    expect(
      await lines([upgraded], { [viewKey(PROXY, "implementation")]: OTHER }),
    ).toEqual([]);
  });

  it("admin and beacon changes", async () => {
    expect(
      await lines(
        [
          eventLog(
            "event AdminChanged(address previousAdmin, address newAdmin)",
            PROXY,
            { previousAdmin: OTHER, newAdmin: IMPL },
          ),
        ],
        {
          [viewKey(PROXY, "admin")]: IMPL,
        },
      ),
    ).toEqual([`assert @proxies:admin!(${PROXY}) == ${IMPL}`]);
    expect(
      await lines(
        [
          eventLog("event BeaconUpgraded(address indexed beacon)", PROXY, {
            beacon: IMPL,
          }),
        ],
        { [viewKey(PROXY, "beacon")]: IMPL },
      ),
    ).toEqual([`assert @proxies:beacon!(${PROXY}) == ${IMPL}`]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
