import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData, stringToHex } from "viem";
import { DAO_ABI } from "../../../src/abis";
import { permissionId } from "../../../src/utils/permissions";
import { DAO_ADDRESS, PREAMBLE } from "../../fixtures";

const INNER_ACTIONS = [
  {
    to: DAO_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: DAO_ABI,
      functionName: "grant",
      args: [DAO_ADDRESS, TEST_ACCOUNT_ADDRESS, permissionId("EXECUTE")],
    }),
  },
];

describeCommand("act", {
  module: "aragonosx",
  preamble: PREAMBLE,
  cases: [
    {
      name: "wraps block actions into a direct dao.execute",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:act --call-id "evmcrispr" (
    aragonosx:grant EXECUTE on dao to ${TEST_ACCOUNT_ADDRESS}
  )
)`,
      expectedActions: [
        {
          to: DAO_ADDRESS,
          data: encodeFunctionData({
            abi: DAO_ABI,
            functionName: "execute",
            args: [stringToHex("evmcrispr", { size: 32 }), INNER_ACTIONS, 0n],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "fails outside a connect block",
      script: `aragonosx:act (
  aragonosx:grant EXECUTE on dao to ${TEST_ACCOUNT_ADDRESS}
)`,
      error: 'used within a "connect" command',
    },
  ],
  docCases: [
    {
      description:
        "Execute directly through the DAO when the caller holds EXECUTE_PERMISSION",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:act (
    aragonosx:grant ROOT on dao to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)`,
    },
  ],
});
