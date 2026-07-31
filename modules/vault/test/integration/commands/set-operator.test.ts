import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CENTRIFUGE_JTRSY_VAULT,
  SDAI,
  SOME_ADDRESS,
  ZERO_ADDRESS,
} from "../../fixtures";

const vaultAbi = parseAbi([
  "function setOperator(address operator, bool approved) returns (bool)",
]);

function decodeSetOperator(action: any) {
  return decodeFunctionData({ abi: vaultAbi, data: action.data });
}

/** Drop the wallet action the `switch mainnet` line emits. */
function txs(actions: Action[]): { to: string; data: `0x${string}` }[] {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
  }[];
}

describeCommand("set-operator", {
  describeName: "Vault > commands > set-operator <operator> on <vault>",
  module: "vault",
  preamble: "load vault",
  cases: [
    {
      name: "approves an operator by default",
      script: `switch mainnet
vault:set-operator ${SOME_ADDRESS} on ${CENTRIFUGE_JTRSY_VAULT}`,
      validate: (actions) => {
        const acts = txs(actions);
        expect(acts).to.have.length(1);
        const action = acts[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          CENTRIFUGE_JTRSY_VAULT.toLowerCase(),
        );
        const { functionName, args = [] } = decodeSetOperator(action);
        expect(functionName).to.eq("setOperator");
        expect((args[0] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect(args[1]).to.eq(true);
      },
    },
    {
      name: "revokes an operator with a trailing `false`",
      script: `switch mainnet
vault:set-operator ${SOME_ADDRESS} on ${CENTRIFUGE_JTRSY_VAULT} false`,
      validate: (actions) => {
        const { args = [] } = decodeSetOperator(txs(actions)[0]);
        expect(args[1]).to.eq(false);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject the zero address as a vault",
      script: `vault:set-operator ${SOME_ADDRESS} on ${ZERO_ADDRESS}`,
      error: "native token has no vault",
    },
    {
      name: "should fail on vaults without ERC-7540 operator support",
      script: `vault:set-operator ${SOME_ADDRESS} on ${SDAI}`,
      error: "does not support ERC-7540 operators",
    },
    {
      name: "should reject a wrong keyword",
      script: `vault:set-operator ${SOME_ADDRESS} of ${CENTRIFUGE_JTRSY_VAULT}`,
      error: 'expected keyword "on"',
    },
  ],
  docCases: [
    {
      description:
        "Approve an operator to request and claim on your behalf on the Centrifuge JTRSY vault",
      code: `load vault

switch mainnet
vault:set-operator 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 on 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A`,
      preamble: "",
    },
    {
      description: "Revoke the same operator with a trailing `false`",
      code: `load vault

switch mainnet
vault:set-operator 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 on 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A false`,
      preamble: "",
    },
  ],
});
