import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const DAO = getAddress("0x00000000000000000000000000000000000a5c01");
const WHERE = getAddress("0x00000000000000000000000000000000000a5c02");
const WHO = getAddress("0x00000000000000000000000000000000000a5c03");
const ID = keccak256(toHex("EXECUTE_PERMISSION"));
const mock = (granted: boolean) => ({
  [DAO]: {
    "isGranted(address,address,bytes32,bytes)": encodeAbiParameters(
      [{ type: "bool" }],
      [granted],
    ),
  },
});

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what granted and revoked permissions suggest runs as a script and holds against the view read", async () => {
  const granted = await suggestionsHold(
    "aragonosx",
    events,
    [
      eventLog(
        "event Granted(bytes32 indexed permissionId, address indexed here, address where, address indexed who, address condition)",
        DAO,
        { permissionId: ID, here: DAO, where: WHERE, who: WHO, condition: WHO },
      ),
    ],
    mock(true),
  );
  const revoked = await suggestionsHold(
    "aragonosx",
    events,
    [
      eventLog(
        "event Revoked(bytes32 indexed permissionId, address indexed here, address where, address indexed who)",
        DAO,
        { permissionId: ID, here: DAO, where: WHERE, who: WHO },
      ),
    ],
    mock(false),
  );
  expect(shown([...granted, ...revoked])).toMatchInlineSnapshot(`
    "granted
      assert $contract::!{isGranted(address,address,bytes32,bytes)(bool) $target $holder 0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d 0x} == true
      0x0000...5C03 has the permission on 0x0000...5c02
    revoked
      assert $contract::!{isGranted(address,address,bytes32,bytes)(bool) $target $holder 0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d 0x} == false
      0x0000...5C03 no longer has the permission on 0x0000...5c02"
  `);
}, 180000);
