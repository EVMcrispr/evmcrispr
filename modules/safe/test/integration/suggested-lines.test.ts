import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";

const SAFE = getAddress("0x00000000000000000000000000000000005afe01");
const WHO = getAddress("0x00000000000000000000000000000000005afe02");
const yes = encodeAbiParameters([{ type: "bool" }], [true]);

test("the lines safe events suggest hold against the views they read", async () => {
  await linesHold(
    "safe",
    [
      `assert @safe:isOwner!(${WHO} ${SAFE}) == true`,
      `assert ${SAFE}::!{isModuleEnabled(address)(bool) ${WHO}} == true`,
      `assert @safe:threshold!(${SAFE}) == 2`,
      `assert @safe:guard!(${SAFE}) == ${WHO}`,
    ],
    {
      [SAFE]: {
        "isOwner(address)": yes,
        "isModuleEnabled(address)": yes,
        "getThreshold()": encodeAbiParameters([{ type: "uint256" }], [2n]),
        "getStorageAt(uint256,uint256)": encodeAbiParameters(
          [{ type: "bytes" }],
          [encodeAbiParameters([{ type: "address" }], [WHO])],
        ),
      },
    },
  );
}, 180000);
