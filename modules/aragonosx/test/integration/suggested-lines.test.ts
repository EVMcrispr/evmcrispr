import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";

const DAO = getAddress("0x00000000000000000000000000000000000a5c01");
const WHERE = getAddress("0x00000000000000000000000000000000000a5c02");
const WHO = getAddress("0x00000000000000000000000000000000000a5c03");
const ID = keccak256(toHex("EXECUTE_PERMISSION"));

test("the line a granted permission suggests holds against the view it reads", async () => {
  await linesHold(
    "aragonosx",
    [
      `assert ${DAO}::!{isGranted(address,address,bytes32,bytes)(bool) ${WHERE} ${WHO} ${ID} 0x} == true`,
    ],
    {
      [DAO]: {
        "isGranted(address,address,bytes32,bytes)": encodeAbiParameters(
          [{ type: "bool" }],
          [true],
        ),
      },
    },
  );
}, 180000);
