import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  DONATION_HANDLER,
  PROJECT_RECIPIENT,
  TIP_RECIPIENT,
  WXDAI,
} from "../../fixtures";

const donationHandlerAbi = parseAbi([
  "function donateETH(address recipientAddress, uint256 amount, bytes data)",
  "function donateManyETH(uint256 totalAmount, address[] recipientAddresses, uint256[] amounts, bytes[] data)",
  "function donateERC20(address tokenAddress, address recipientAddress, uint256 amount, bytes data)",
  "function donateManyERC20(address tokenAddress, uint256 totalAmount, address[] recipientAddresses, uint256[] amounts, bytes[] data)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;
const TIP = 5n * 10n ** 18n; // 5% of AMOUNT

function decodeDonation(action: any) {
  return decodeFunctionData({ abi: donationHandlerAbi, data: action.data });
}

describeCommand("donate", {
  describeName: "Giveth > commands > donate <amount> <token> to <slug>",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "donates an ERC-20 through the DonationHandler with auto-approve",
      script: `giveth:donate 100e18 ${WXDAI} to evmcrispr`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, donate] = actions as any[];

        expect(approve.to).to.eq(WXDAI);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([DONATION_HANDLER, AMOUNT]);

        expect(donate.to).to.eq(DONATION_HANDLER);
        const { functionName, args } = decodeDonation(donate);
        expect(functionName).to.eq("donateERC20");
        expect(args).to.eql([WXDAI, PROJECT_RECIPIENT, AMOUNT, "0x"]);
      },
    },
    {
      name: "donates the native token via donateETH with the amount as value",
      script: "giveth:donate 1e18 @token(XDAI) to evmcrispr",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const donate = actions[0] as any;
        expect(donate.to).to.eq(DONATION_HANDLER);
        expect(donate.value).to.eq(10n ** 18n);
        const { functionName, args } = decodeDonation(donate);
        expect(functionName).to.eq("donateETH");
        expect(args).to.eql([PROJECT_RECIPIENT, 10n ** 18n, "0x"]);
      },
    },
    {
      name: "adds a --tip donation to Giveth on top in the same transaction",
      script: `giveth:donate 100e18 ${WXDAI} to evmcrispr --tip 5`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, donate] = actions as any[];

        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([DONATION_HANDLER, AMOUNT + TIP]);

        const { functionName, args } = decodeDonation(donate);
        expect(functionName).to.eq("donateManyERC20");
        expect(args).to.eql([
          WXDAI,
          AMOUNT + TIP,
          [PROJECT_RECIPIENT, TIP_RECIPIENT],
          [AMOUNT, TIP],
          ["0x", "0x"],
        ]);
      },
    },
    {
      name: "tips native donations via donateManyETH",
      script: "giveth:donate 100e18 @token(XDAI) to evmcrispr --tip 5",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const donate = actions[0] as any;
        expect(donate.value).to.eq(AMOUNT + TIP);
        const { functionName, args } = decodeDonation(donate);
        expect(functionName).to.eq("donateManyETH");
        expect(args).to.eql([
          AMOUNT + TIP,
          [PROJECT_RECIPIENT, TIP_RECIPIENT],
          [AMOUNT, TIP],
          ["0x", "0x"],
        ]);
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `giveth:donate 100e18 ${WXDAI} to evmcrispr --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).to).to.eq(DONATION_HANDLER);
      },
    },
    {
      name: "executes a native donation inside sim:fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  giveth:donate 1e18 @token(XDAI) to evmcrispr
  sim:expect @bool(@token.balance(XDAI ${PROJECT_RECIPIENT}) >= 1e18)
)`,
      validate: () => {
        // Reaching this point means donateETH executed on the fork without
        // reverting and the recipient balance expectation held.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the project is not found",
      script: `giveth:donate 1e18 ${WXDAI} to nonexistent-project-slug-xyz`,
      error: "Project not found",
    },
    {
      name: "should fail on chains without a DonationHandler",
      script: `switch 1101\ngiveth:donate 1e18 ${WXDAI} to evmcrispr`,
      error: "the Giveth donation handler is not deployed on chain 1101",
    },
    {
      name: "should fail on a zero amount",
      script: `giveth:donate 0 ${WXDAI} to evmcrispr`,
      error: "greater than zero",
    },
    {
      name: "should reject tips above 100 percent",
      script: `giveth:donate 1e18 ${WXDAI} to evmcrispr --tip 150`,
      error: "--tip must be a percentage between 0 and 100",
    },
    {
      name: "should fail without the `to` keyword",
      script: `giveth:donate 1e18 ${WXDAI} evmcrispr`,
      error: "invalid number of arguments",
    },
  ],
  docCases: [
    {
      description: "Donate 100 GIV to a Giveth project",
      code: `set $std:tokenlist https://tokens.honeyswap.org
giveth:donate 100e18 @token(GIV) to evmcrispr`,
    },
    {
      description: "Donate native xDAI with a 5% tip to Giveth on top",
      code: "giveth:donate 10e18 @token(XDAI) to evmcrispr --tip 5",
    },
    {
      description: "Donate to several projects in one transaction",
      code: `set $std:tokenlist https://tokens.honeyswap.org
batch (
  giveth:donate 100e18 @token(GIV) to evmcrispr
  giveth:donate 50e18 @token(GIV) to the-giveth-community-of-makers
)`,
    },
  ],
});
