import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
import { helpers } from "../../../src/_generated";
import { GNO } from "../../fixtures";

describeHelper(
  "@token:totalSupply",
  {
    module: "token",
    cases: [
      {
        name: "should return the total supply of an ERC-20 token",
        input: `@token:totalSupply(${GNO})`,
        // Compare against a direct eth_call instead of a pinned value:
        // other suites sharing the anvil fork mint/burn tokens, so the
        // supply is only deterministic on a fresh fork.
        validate: async (result) => {
          const supply = (await getPublicClient().readContract({
            address: GNO,
            abi: parseAbi(["function totalSupply() view returns (uint256)"]),
            functionName: "totalSupply",
          })) as bigint;
          expect(String(result)).to.eq(String(supply));
          expect(supply > 0n).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Query the total supply of a token",
        code: `set $supply @token:totalSupply(DAI)`,
      },
      {
        description: "Print the total supply in human-readable form",
        code: `print @token:format(DAI @token:totalSupply(DAI))`,
      },
    ],
    errorCases: [
      {
        name: "should fail for the native token",
        input: "@token:totalSupply(XDAI)",
        error: "native token has no total supply",
      },
    ],
    sampleArgs: [GNO],
  },
  helpers.totalSupply.argDefs,
);
