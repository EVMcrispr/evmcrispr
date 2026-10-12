import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";

const TARGET = getAddress("0x00000000000000000000000000000000000ac101");
const ALICE = getAddress("0x00000000000000000000000000000000000a11ce");
const ROLE = keccak256(toHex("MINTER_ROLE"));
const word = (type: string, value: unknown) =>
  encodeAbiParameters([{ type }], [value as never]);
const pair = (a: string, x: unknown, b: string, y: unknown) =>
  encodeAbiParameters([{ type: a }, { type: b }], [x as never, y as never]);

test("the lines acl events suggest hold against the views they read", async () => {
  await linesHold(
    "acl",
    [
      `assert @acl:hasRole!(${TARGET} ${ROLE} ${ALICE}) == true`,
      `assert @acl:hasRole!(${TARGET} 7 ${ALICE}) == true`,
      `assert @acl:roleAdmin!(${TARGET} ${ROLE}) == ${ROLE}`,
      `assert @acl:owner!(${TARGET}) == ${ALICE}`,
      `assert @acl:pendingOwner!(${TARGET}) == ${ALICE}`,
      `assert @acl:pendingDefaultAdmin!(${TARGET}) == ${ALICE}`,
      `assert ${TARGET}::!{pendingDefaultAdminDelay()(uint48,uint48)}[$ _] == 600`,
    ],
    {
      [TARGET]: {
        "hasRole(bytes32,address)": word("bool", true),
        "hasRole(uint64,address)": pair("bool", true, "uint32", 0),
        "getRoleAdmin(bytes32)": ROLE,
        "owner()": word("address", ALICE),
        "pendingOwner()": word("address", ALICE),
        "pendingDefaultAdmin()": pair("address", ALICE, "uint48", 9),
        "pendingDefaultAdminDelay()": pair("uint48", 600, "uint48", 9),
      },
    },
  );
  await linesHold(
    "acl",
    [
      `assert @acl:hasRole!(${TARGET} ${ROLE} ${ALICE}) == false`,
      `assert @acl:hasRole!(${TARGET} 7 ${ALICE}) == false`,
    ],
    {
      [TARGET]: {
        "hasRole(bytes32,address)": word("bool", false),
        "hasRole(uint64,address)": pair("bool", false, "uint32", 0),
      },
    },
  );
}, 180000);
