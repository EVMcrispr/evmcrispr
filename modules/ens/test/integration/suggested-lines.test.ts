import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";

const REGISTRY = getAddress("0x0000000000000000000000000000000000e05001");
const WHO = getAddress("0x0000000000000000000000000000000000e05002");
const NODE = keccak256(toHex("node"));
const answer = encodeAbiParameters([{ type: "address" }], [WHO]);

test("the lines ens events suggest hold against the views they read", async () => {
  await linesHold(
    "ens",
    [
      `assert ${REGISTRY}::!{owner(bytes32)(address) ${NODE}} == ${WHO}`,
      `assert ${REGISTRY}::!{resolver(bytes32)(address) ${NODE}} == ${WHO}`,
    ],
    { [REGISTRY]: { "owner(bytes32)": answer, "resolver(bytes32)": answer } },
  );
}, 180000);
