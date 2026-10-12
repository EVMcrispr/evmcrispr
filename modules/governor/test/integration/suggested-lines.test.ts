import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";

const GOV = getAddress("0x00000000000000000000000000000000000060f1");
const ID = keccak256(toHex("operation"));

test("the lines governor events suggest hold against the views they read", async () => {
  await linesHold(
    "governor",
    [
      `assert ${GOV}::!{state(uint256)(uint8) 42} == 0`,
      `assert ${GOV}::!{isOperationPending(bytes32)(bool) ${ID}} == true`,
      `assert @governor:timelockMinDelay!(${GOV}) == 3600`,
    ],
    {
      [GOV]: {
        "state(uint256)": encodeAbiParameters([{ type: "uint8" }], [0]),
        "isOperationPending(bytes32)": encodeAbiParameters(
          [{ type: "bool" }],
          [true],
        ),
        "getMinDelay()": encodeAbiParameters([{ type: "uint256" }], [3600n]),
      },
    },
  );
}, 180000);
