import "../setup";
import { describe, expect, it } from "bun:test";
import { collectSuggestions } from "@evmcrispr/sdk";
import {
  eventLog,
  suggestEnv,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const ACL = getAddress("0x00000000000000000000000000000000000a4a01");
const ENTITY = getAddress("0x00000000000000000000000000000000000a4a02");
const APP = getAddress("0x00000000000000000000000000000000000a4a03");
const ROLE = keccak256(toHex("MINT_ROLE"));
const SIG =
  "event SetPermission(address indexed entity, address indexed app, bytes32 indexed role, bool allowed)";
const lines = async (allowed: boolean, answers: Record<string, unknown>) =>
  (
    await collectSuggestions({
      modules: [{ name: "aragonos", events }],
      logs: [
        eventLog(SIG, ACL, { entity: ENTITY, app: APP, role: ROLE, allowed }),
      ],
      env: suggestEnv(answers),
    })
  ).map((s) => s.line);

describe("aragonos events", () => {
  it("a set permission is confirmed by the ACL", async () => {
    const line = (v: boolean) =>
      `assert ${ACL}::!{hasPermission(address,address,bytes32)(bool) ${ENTITY} ${APP} ${ROLE}} == ${v}`;
    expect(
      await lines(true, {
        [viewKey(ACL, "hasPermission", ENTITY, APP, ROLE)]: true,
      }),
    ).toEqual([line(true)]);
    expect(
      await lines(false, {
        [viewKey(ACL, "hasPermission", ENTITY, APP, ROLE)]: false,
      }),
    ).toEqual([line(false)]);
    expect(
      await lines(true, {
        [viewKey(ACL, "hasPermission", ENTITY, APP, ROLE)]: false,
      }),
    ).toEqual([]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
