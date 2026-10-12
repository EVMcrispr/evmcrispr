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

const DAO = getAddress("0x00000000000000000000000000000000000a5c01");
const WHERE = getAddress("0x00000000000000000000000000000000000a5c02");
const WHO = getAddress("0x00000000000000000000000000000000000a5c03");
const ID = keccak256(toHex("EXECUTE_PERMISSION"));
const key = viewKey(DAO, "isGranted", WHERE, WHO, ID, "0x");
const line = (v: boolean) =>
  `assert ${DAO}::!{isGranted(address,address,bytes32,bytes)(bool) ${WHERE} ${WHO} ${ID} 0x} == ${v}`;
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await collectSuggestions({
      modules: [{ name: "aragonosx", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map((s) => s.line);

describe("aragonosx events", () => {
  it("granted and revoked permissions are confirmed by isGranted", async () => {
    const granted = eventLog(
      "event Granted(bytes32 indexed permissionId, address indexed here, address where, address indexed who, address condition)",
      DAO,
      { permissionId: ID, here: DAO, where: WHERE, who: WHO, condition: WHO },
    );
    const revoked = eventLog(
      "event Revoked(bytes32 indexed permissionId, address indexed here, address where, address indexed who)",
      DAO,
      {
        permissionId: ID,
        here: DAO,
        where: WHERE,
        who: WHO,
      },
    );
    expect(await lines([granted], { [key]: true })).toEqual([line(true)]);
    // A conditional grant the condition refuses for empty data: not confirmed.
    expect(await lines([granted], { [key]: false })).toEqual([]);
    expect(await lines([revoked], { [key]: false })).toEqual([line(false)]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
