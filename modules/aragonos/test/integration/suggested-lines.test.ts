import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const ACL = getAddress("0x00000000000000000000000000000000000a4a01");
const ENTITY = getAddress("0x00000000000000000000000000000000000a4a02");
const APP = getAddress("0x00000000000000000000000000000000000a4a03");
const ROLE = keccak256(toHex("MINT_ROLE"));

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what a set permission suggests runs as a script and holds against the view read", async () => {
  const out = [];
  for (const allowed of [true, false]) {
    out.push(
      ...(await suggestionsHold(
        "aragonos",
        events,
        [
          eventLog(
            "event SetPermission(address indexed entity, address indexed app, bytes32 indexed role, bool allowed)",
            ACL,
            { entity: ENTITY, app: APP, role: ROLE, allowed },
          ),
        ],
        {
          [ACL]: {
            "hasPermission(address,address,bytes32)": encodeAbiParameters(
              [{ type: "bool" }],
              [allowed],
            ),
          },
        },
      )),
    );
  }
  expect(shown(out)).toMatchInlineSnapshot(`
    "setPermission
      assert $contract::!{hasPermission(address,address,bytes32)(bool) $entity $target 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686} == true
      0x0000...4A02 has the permission on 0x0000...4A03
    setPermission
      assert $contract::!{hasPermission(address,address,bytes32)(bool) $entity $target 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686} == false
      0x0000...4A02 no longer has the permission on 0x0000...4A03"
  `);
}, 180000);
