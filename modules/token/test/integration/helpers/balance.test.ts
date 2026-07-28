import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
import { helpers } from "../../../src/_generated";
import { OTHER_ADDRESS } from "../../fixtures";

describeHelper(
  "@token:balance",
  {
    module: "token",
    cases: [
      {
        name: "should return ERC-20 balance for a holder",
        input: "@token:balance(DAI @token(DAI))",
        // Compare against a direct eth_call instead of a pinned value:
        // other suites sharing the anvil fork move tokens, so the balance
        // is only deterministic on a fresh fork.
        validate: async (result) => {
          const dai = "0x44fA8E6f47987339850636F88629646662444217";
          const balance = (await getPublicClient().readContract({
            address: dai,
            abi: parseAbi([
              "function balanceOf(address) view returns (uint256)",
            ]),
            functionName: "balanceOf",
            args: [dai],
          })) as bigint;
          expect(String(result)).to.eq(String(balance));
        },
      },
      {
        name: "should return native token balance for a holder",
        input: `@token:balance(XDAI ${OTHER_ADDRESS})`,
        validate: (result) => {
          expect(Number(result)).to.be.greaterThanOrEqual(0);
        },
      },
    ],
    docCases: [
      {
        description: "Query a token balance",
        code: `set $bal @token:balance(DAI @token(DAI))`,
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)"],
  },
  helpers.balance.argDefs,
);
