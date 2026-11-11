import "../setup";
import { describe, expect, it } from "bun:test";
import { CORE_ADDRESS } from "@evmcrispr/sdk/onchain";
import {
  asCaller,
  eventLog,
  literalLine,
  slotKey,
  suggestEnv,
  suggested,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";
import { events } from "../../src/_generated";
import { ADMIN_SLOT } from "../../src/utils";

const PROXY = getAddress("0x0000000000000000000000000000000000009801");
const IMPL = getAddress("0x0000000000000000000000000000000000009802");
const OTHER = getAddress("0x0000000000000000000000000000000000009803");
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await suggested({
      modules: [{ name: "proxies", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map(literalLine);

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

  // Optimism's Proxy: implementation() and admin() answer the admin and an
  // eth_call from address zero, and forward anyone else (the Assertions
  // core) to the implementation, which reverts.
  const ADMIN = getAddress("0x0000000000000000000000000000000000009804");
  const opProxy = {
    [viewKey(PROXY, "implementation")]: IMPL,
    [asCaller(CORE_ADDRESS, viewKey(PROXY, "implementation"))]: undefined,
    [viewKey(PROXY, "admin")]: ADMIN,
    [asCaller(CORE_ADDRESS, viewKey(PROXY, "admin"))]: undefined,
    [slotKey(PROXY, ADMIN_SLOT)]: encodeAbiParameters(
      [{ type: "address" }],
      [ADMIN],
    ),
  };

  it("an upgrade only an eth_call from zero can read is dropped: the assertion would certainly fail", async () => {
    expect(await lines([upgraded], opProxy)).toEqual([]);
  });

  it("and confirmed when the proxy's ProxyAdmin reports it, the route the assertion takes", async () => {
    expect(
      await lines([upgraded], {
        ...opProxy,
        [viewKey(ADMIN, "getProxyImplementation", PROXY)]: IMPL,
      }),
    ).toEqual([`assert @proxies:implementation!(${PROXY}) == ${IMPL}`]);
    // A ProxyAdmin that says otherwise is no route.
    expect(
      await lines([upgraded], {
        ...opProxy,
        [viewKey(ADMIN, "getProxyImplementation", PROXY)]: OTHER,
      }),
    ).toEqual([]);
  });

  it("an admin change only an eth_call from zero can read is dropped", async () => {
    const changed = eventLog(
      "event AdminChanged(address previousAdmin, address newAdmin)",
      PROXY,
      { previousAdmin: OTHER, newAdmin: ADMIN },
    );
    expect(await lines([changed], opProxy)).toEqual([]);
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
