import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { SDAI, SOME_ADDRESS, WXDAI, ZERO_ADDRESS } from "../../fixtures";

const vaultAbi = parseAbi([
  "function mint(uint256 shares, address receiver) returns (uint256)",
  "function previewMint(uint256 shares) view returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const SHARES = 100n * 10n ** 18n;

function decodeMint(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

describeCommand("mint", {
  describeName: "Vault > commands > mint <shares> of <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "mints shares approving previewMint worth of the asset",
      script: `vault:mint 100e18 of ${SDAI}`,
      setup: (client) =>
        client.readContract({
          address: SDAI,
          abi: vaultAbi,
          functionName: "previewMint",
          args: [SHARES],
        }),
      validate: (actions, _interpreter, required) => {
        expect(actions).to.have.length(2);
        const [approve, mint] = actions as any[];

        expect((approve.to as string).toLowerCase()).to.eq(WXDAI.toLowerCase());
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approval.args?.[0] as string).toLowerCase()).to.eq(
          SDAI.toLowerCase(),
        );
        expect(approval.args?.[1]).to.eq(required);

        expect((mint.to as string).toLowerCase()).to.eq(SDAI.toLowerCase());
        const { functionName, args } = decodeMint(mint);
        expect(functionName).to.eq("mint");
        expect(args?.[0]).to.eq(SHARES);
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `vault:mint 100e18 of ${SDAI} --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect(((actions[0] as any).to as string).toLowerCase()).to.eq(
          SDAI.toLowerCase(),
        );
      },
    },
    {
      name: "mints the shares to --to when given",
      script: `vault:mint 100e18 of ${SDAI} --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeMint(actions.at(-1));
        expect((args?.[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `vault:mint 0 of ${SDAI}`,
      error: "greater than zero",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:mint 100e18 of ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      script: `vault:mint 100e18 of ${SOME_ADDRESS}`,
      error: "does not look like an ERC-4626 vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:mint 100e18 from ${SDAI}`,
      error: 'expected keyword "of"',
    },
  ],
  docCases: [
    {
      description:
        "Mint exactly 100 sDAI shares, approving previewMint worth of WXDAI",
      code: "vault:mint 100e18 of 0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    },
  ],
});
