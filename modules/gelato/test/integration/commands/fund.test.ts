import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { polygon } from "viem/chains";
import { oneBalanceAbi } from "../../../src/abis";
import { CHECKER, ONE_BALANCE, USDC_POLYGON } from "../../fixtures";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function lastDeposit(actions: any[]) {
  const action = actions[actions.length - 1];
  expect((action.to as string).toLowerCase()).to.eq(ONE_BALANCE.toLowerCase());
  const { functionName, args } = decodeFunctionData({
    abi: oneBalanceAbi,
    data: action.data,
  });
  expect(functionName).to.eq("depositToken");
  return args as unknown as [string, string, bigint];
}

describeCommand("fund", {
  module: "gelato",
  preamble: "load gelato",
  chainId: polygon.id,
  cases: [
    {
      name: "approves USDC and deposits for the connected account",
      script: "gelato:fund 100e6 USDC",
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const approve = actions[0] as any;
        expect((approve.to as string).toLowerCase()).to.eq(
          USDC_POLYGON.toLowerCase(),
        );
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(decoded.functionName).to.eq("approve");
        expect((decoded.args[0] as string).toLowerCase()).to.eq(
          ONE_BALANCE.toLowerCase(),
        );
        expect(decoded.args[1]).to.eq(100_000_000n);
        const [sponsor, token, amount] = lastDeposit(actions);
        expect(sponsor.toLowerCase()).to.eq(TEST_ACCOUNT_ADDRESS.toLowerCase());
        expect(token.toLowerCase()).to.eq(USDC_POLYGON.toLowerCase());
        expect(amount).to.eq(100_000_000n);
      },
    },
    {
      name: "credits another sponsor with `for` and skips the approval",
      script: `gelato:fund 5e6 USDC for ${CHECKER} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const [sponsor] = lastDeposit(actions);
        expect(sponsor.toLowerCase()).to.eq(CHECKER.toLowerCase());
      },
    },
  ],
  errorCases: [
    {
      name: "rejects tokens other than USDC",
      script: `gelato:fund 1e18 ${CHECKER} --no-approve true`,
      error: "only accepts native USDC",
    },
    {
      name: "rejects a wrong keyword",
      script: `gelato:fund 5e6 USDC to ${CHECKER}`,
      error: 'expected keyword "for"',
    },
    {
      name: "rejects a zero amount",
      script: "gelato:fund 0 USDC --no-approve true",
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description: "Top up your Gas Tank with 100 USDC (on Polygon)",
      code: "gelato:fund 100e6 USDC",
    },
    {
      description: "Fund the Gas Tank of a DAO that creates the tasks",
      code: "gelato:fund 250e6 USDC for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71",
    },
  ],
});

describeCommand("fund (wrong chain)", {
  module: "gelato",
  preamble: "load gelato",
  describeName: "Gelato > commands > fund on a chain without the Gas Tank",
  errorCases: [
    {
      name: "points at Polygon",
      script: "gelato:fund 100e6 USDC",
      error: "Gas Tank lives on Polygon",
    },
  ],
});
