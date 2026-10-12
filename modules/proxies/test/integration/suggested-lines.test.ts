import "../setup";
import { test } from "bun:test";
import { linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";

const PROXY = getAddress("0x0000000000000000000000000000000000009801");
const IMPL = getAddress("0x0000000000000000000000000000000000009802");
const answer = encodeAbiParameters([{ type: "address" }], [IMPL]);

test("the lines proxies events suggest hold against the views they read", async () => {
  await linesHold(
    "proxies",
    [
      `assert @proxies:implementation!(${PROXY}) == ${IMPL}`,
      `assert @proxies:admin!(${PROXY}) == ${IMPL}`,
      `assert @proxies:beacon!(${PROXY}) == ${IMPL}`,
    ],
    {
      [PROXY]: {
        "implementation()": answer,
        "admin()": answer,
        "beacon()": answer,
      },
    },
  );
}, 180000);
