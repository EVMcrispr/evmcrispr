import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { SDAI, SOME_ADDRESS, WXDAI, ZERO_ADDRESS } from "../../fixtures";

const vaultAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

function decodeDeposit(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

describeCommand("deposit", {
  describeName: "Vault > commands > deposit <assets> into <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "deposits the underlying asset with auto-approve to the vault",
      script: `vault:deposit 100e18 into ${SDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, deposit] = actions as any[];

        expect((approve.to as string).toLowerCase()).to.eq(WXDAI.toLowerCase());
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approval.args?.[0] as string).toLowerCase()).to.eq(
          SDAI.toLowerCase(),
        );
        expect(approval.args?.[1]).to.eq(AMOUNT);

        expect((deposit.to as string).toLowerCase()).to.eq(SDAI.toLowerCase());
        const { functionName, args } = decodeDeposit(deposit);
        expect(functionName).to.eq("deposit");
        expect(args?.[0]).to.eq(AMOUNT);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `vault:deposit 100e18 into ${SDAI} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect(((actions[0] as any).to as string).toLowerCase()).to.eq(
          SDAI.toLowerCase(),
        );
      },
    },
    {
      name: "mints the shares to --to when given",
      script: `vault:deposit 100e18 into ${SDAI} --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeDeposit(actions.at(-1));
        expect((args?.[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "runs a full deposit/withdraw/redeem-max lifecycle inside sim:fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  exec ${WXDAI} deposit() --value 10000e18
  vault:deposit 5000e18 into ${SDAI}
  sim:expect @bool(@vault:maxWithdraw(${SDAI}) >= 4999e18)
  vault:withdraw 1000e18 from ${SDAI}
  vault:redeem max of ${SDAI}
  sim:expect @bool(@vault:maxWithdraw(${SDAI}) == 0)
)`,
      validate: () => {
        // Reaching this point means every vault call (approve, deposit,
        // withdraw, redeem max) executed on the fork without reverting and
        // the maxWithdraw expectations held.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `vault:deposit 0 into ${SDAI}`,
      error: "greater than zero",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:deposit 100e18 into ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      script: `vault:deposit 100e18 into ${SOME_ADDRESS}`,
      error: "does not look like an ERC-4626 vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:deposit 100e18 to ${SDAI}`,
      error: 'expected keyword "into"',
    },
  ],
  docCases: [
    {
      description:
        "Deposit 100 WXDAI into the sDAI vault on Gnosis (auto-approves)",
      code: "vault:deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    },
    {
      description:
        "Deposit 1000 USDC into the Steakhouse USDC Morpho vault on Ethereum",
      code: `load vault

switch mainnet
vault:deposit 1000e6 into 0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB`,
      preamble: "",
    },
    {
      description: "Import the command to drop the vault: prefix",
      code: `load vault [deposit]

deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701`,
      preamble: "",
    },
  ],
});
