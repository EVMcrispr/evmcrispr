import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CENTRIFUGE_JTRSY_VAULT,
  SDAI,
  SOME_ADDRESS,
  USDC_MAINNET,
  WXDAI,
  ZERO_ADDRESS,
} from "../../fixtures";
import {
  MOCK_ERC7540_BYTECODE,
  MOCK_SHARE_BYTECODE,
} from "../../fixtures/mock-erc7540";

const vaultAbi = parseAbi([
  "function requestDeposit(uint256 assets, address controller, address owner) returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 1000n * 10n ** 6n;

function decodeRequestDeposit(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

/** Drop the wallet action the `switch mainnet` line emits. */
function txs(actions: Action[]): { to: string; data: `0x${string}` }[] {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

describeCommand("request-deposit", {
  describeName: "Vault > commands > request-deposit <assets> into <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "requests a deposit with auto-approve to the vault",
      script: `switch mainnet
vault:request-deposit 1000e6 into ${CENTRIFUGE_JTRSY_VAULT}`,
      validate: (actions) => {
        const acts = txs(actions);
        expect(acts).to.have.length(2);
        const [approve, request] = acts as any[];

        expect((approve.to as string).toLowerCase()).to.eq(
          USDC_MAINNET.toLowerCase(),
        );
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approvalArgs[0] as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
        expect(approvalArgs[1]).to.eq(AMOUNT);

        expect((request.to as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
        const { functionName, args = [] } = decodeRequestDeposit(request);
        expect(functionName).to.eq("requestDeposit");
        expect(args[0]).to.eq(AMOUNT);
        expect((args[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "assigns the request to --controller when given",
      script: `switch mainnet
vault:request-deposit 1000e6 into ${CENTRIFUGE_JTRSY_VAULT} --controller ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args = [] } = decodeRequestDeposit(txs(actions).at(-1));
        expect((args[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: `switch mainnet
vault:request-deposit 1000e6 into ${CENTRIFUGE_JTRSY_VAULT} --no-approve true`,
      validate: (actions) => {
        const acts = txs(actions);
        expect(acts).to.have.length(1);
        expect((acts[0].to as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
      },
    },
    {
      name: "runs a full request/fulfill/claim lifecycle against a mock ERC-7540 vault inside sim:fork",
      script: `load sim
load contracts
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  contracts:deploy $share ${MOCK_SHARE_BYTECODE}
  contracts:deploy $vault ${MOCK_ERC7540_BYTECODE} --constructor constructor(address,address) --constructor-args [${WXDAI} $share]
  exec ${WXDAI} deposit() --value 10000e18
  vault:request-deposit 5000e18 into $vault
  sim:expect @bool(@vault:pendingDeposit($vault) == 5000e18)
  exec $vault fulfillDeposit(address) @me
  sim:expect @bool(@vault:claimableDeposit($vault) == 5000e18)
  vault:claim-deposit max from $vault
  sim:expect @bool(@vault:share($vault) == $share)
  vault:request-redeem max of $vault
  sim:expect @bool(@vault:pendingRedeem($vault) == 5000e18)
  exec $vault fulfillRedeem(address) @me
  vault:claim-redeem max from $vault
  sim:expect @bool(@vault:claimableRedeem($vault) == 0)
)`,
      validate: () => {
        // Reaching this point means the whole asynchronous lifecycle
        // (request-deposit with approval, fulfillment, claim-deposit max,
        // request-redeem max, fulfillment, claim-redeem max) executed on the
        // fork without reverting and every request-state expectation held.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `vault:request-deposit 0 into ${SDAI}`,
      error: "greater than zero",
    },
    {
      name: "should reject the zero address as a vault",
      script: `vault:request-deposit 1000e6 into ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on synchronous ERC-4626 vaults",
      script: `vault:request-deposit 1000e18 into ${SDAI}`,
      error: "is not an asynchronous-deposit vault",
    },
    {
      name: "should fail on addresses that are not vaults",
      script: `vault:request-deposit 1000e6 into ${SOME_ADDRESS}`,
      error: "is not an asynchronous-deposit vault",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:request-deposit 1000e6 to ${CENTRIFUGE_JTRSY_VAULT}`,
      error: 'expected keyword "into"',
    },
  ],
  docCases: [
    {
      description:
        "Request a deposit of 1000 USDC into the Centrifuge JTRSY vault on Ethereum (auto-approves)",
      code: `load vault

switch mainnet
vault:request-deposit 1000e6 into 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A`,
      preamble: "",
    },
    {
      description:
        "Request a deposit for another controller, who will claim the shares",
      code: `load vault

switch mainnet
vault:request-deposit 1000e6 into 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A --controller 0x4F2083f5fBede34C2714aFfb3105539775f7FE64`,
      preamble: "",
    },
  ],
});
