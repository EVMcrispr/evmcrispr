import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CENTRIFUGE_JTRSY_VAULT,
  SDAI,
  SOME_ADDRESS,
  ZERO_ADDRESS,
} from "../../fixtures";

const vaultAbi = parseAbi([
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
]);

const SHARES = 50n * 10n ** 18n;

function decodeRedeem(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

describeCommand("redeem", {
  describeName: "Vault > commands > redeem <shares|max> of <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "redeems an explicit amount of shares to the connected account",
      script: `vault:redeem 50e18 of ${SDAI}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(SDAI.toLowerCase());
        const { functionName, args = [] } = decodeRedeem(action);
        expect(functionName).to.eq("redeem");
        expect(args[0]).to.eq(SHARES);
        expect((args[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "sends the redeemed assets to --to, burning the callers shares",
      script: `vault:redeem 50e18 of ${SDAI} --to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeRedeem(actions[0]);
        expect((args[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should reject barewords other than `max`",
      script: `vault:redeem everything of ${SDAI}`,
      error: "must be a number or the keyword `max`",
    },
    {
      name: "should fail `max` when there is nothing to redeem",
      script: `vault:redeem max of ${SDAI}`,
      error: "nothing to redeem",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:redeem 50e18 of ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail `max` on addresses that are not ERC-4626 vaults",
      script: `vault:redeem max of ${SOME_ADDRESS}`,
      error: "does not look like an ERC-4626 vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:redeem 50e18 from ${SDAI}`,
      error: 'expected keyword "of"',
    },
    {
      name: "should point to vault:request-redeem on ERC-7540 asynchronous vaults",
      script: `switch mainnet
vault:redeem 100e6 of ${CENTRIFUGE_JTRSY_VAULT}`,
      error: "use vault:request-redeem",
    },
  ],
  docCases: [
    {
      description: "Redeem 50 sDAI shares for WXDAI on Gnosis",
      code: "vault:redeem 50e18 of 0xaf204776c7245bF4147c2612BF6e5972Ee483701",
    },
    {
      description:
        "Exit a vault completely with `max`, previewed inside a fork simulation",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 200e18
  exec 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d deposit() --value 100e18
  vault:deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701
  vault:redeem max of 0xaf204776c7245bF4147c2612BF6e5972Ee483701
)`,
      preamble: "load vault",
    },
  ],
});
