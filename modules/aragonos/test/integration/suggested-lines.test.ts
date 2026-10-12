import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";

const ACL = getAddress("0x00000000000000000000000000000000000a4a01");
const ENTITY = getAddress("0x00000000000000000000000000000000000a4a02");
const APP = getAddress("0x00000000000000000000000000000000000a4a03");
const ROLE = keccak256(toHex("MINT_ROLE"));

test("the line a set permission suggests holds against the view it reads", async () => {
  await linesHold(
    "aragonos",
    [
      `assert ${ACL}::!{hasPermission(address,address,bytes32)(bool) ${ENTITY} ${APP} ${ROLE}} == true`,
    ],
    {
      [ACL]: {
        "hasPermission(address,address,bytes32)": encodeAbiParameters(
          [{ type: "bool" }],
          [true],
        ),
      },
    },
  );
}, 180000);
