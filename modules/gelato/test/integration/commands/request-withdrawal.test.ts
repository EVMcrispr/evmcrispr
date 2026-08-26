import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import { oneBalanceAbi } from "../../../src/abis";
import { ONE_BALANCE, USDC_POLYGON } from "../../fixtures";

describeCommand("request-withdrawal", {
  module: "gelato",
  preamble: "load gelato",
  chainId: polygon.id,
  cases: [
    {
      name: "builds a requestWithdrawal action",
      script: "gelato:request-withdrawal 40e6 USDC",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          ONE_BALANCE.toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: oneBalanceAbi,
          data: action.data,
        });
        expect(functionName).to.eq("requestWithdrawal");
        expect(String(args?.[0]).toLowerCase()).to.eq(
          USDC_POLYGON.toLowerCase(),
        );
        expect(args?.[1]).to.eq(40_000_000n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a negative amount",
      script: "gelato:request-withdrawal -1 USDC",
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description: "Ask Gelato to release 40 USDC from your Gas Tank",
      code: "gelato:request-withdrawal 40e6 USDC",
    },
  ],
});
