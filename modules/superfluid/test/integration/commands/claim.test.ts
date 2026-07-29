import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { RECEIVER, SOME_ADDRESS } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function claimAll(address pool, address memberAddress, bytes userData) returns (bool)",
]);

describeCommand("claim", {
  describeName: "Superfluid > commands > claim from <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "claims for the connected account by default",
      script: `superfluid:claim from ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName, args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("claimAll");
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "claims for another member with --for",
      script: `superfluid:claim from ${SOME_ADDRESS} --for ${RECEIVER}`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect((args?.[1] as string).toLowerCase()).to.eq(
          RECEIVER.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a wrong keyword",
      script: `superfluid:claim of ${SOME_ADDRESS}`,
      error: 'expected keyword "from"',
    },
  ],
  docCases: [
    {
      description:
        "Claim a member's accrued pool earnings without connecting them",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:claim from $rewards --for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71`,
    },
  ],
});
