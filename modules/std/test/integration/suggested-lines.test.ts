import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";

const TARGET = getAddress("0x0000000000000000000000000000000000005d01");

test("the lines std events suggest hold against the views they read", async () => {
  await linesHold("std", [`assert ${TARGET}::!{paused()(bool)} == true`], {
    [TARGET]: { "paused()": encodeAbiParameters([{ type: "bool" }], [true]) },
  });
}, 180000);
