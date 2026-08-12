import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GDA_FORWARDER, SOME_ADDRESS, XDAIX } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function distribute(address token, address from, address pool, uint256 requestedAmount, bytes userData) returns (bool)",
]);

describeCommand("distribute", {
  describeName: "Superfluid > commands > distribute <amount> <token> to <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds an instant distribution from the connected account",
      script: `superfluid:distribute 400e18 ${XDAIX} to ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          GDA_FORWARDER.toLowerCase(),
        );
        const { functionName, args = [] } = decodeFunctionData({
          abi: forwarderAbi,
          data: action.data,
        });
        expect(functionName).to.eq("distribute");
        expect((args[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect(args[3]).to.eq(400n * 10n ** 18n);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on a zero amount",
      script: `superfluid:distribute 0 ${XDAIX} to ${SOME_ADDRESS}`,
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description:
        "Distribute 400 xDAIx instantly to all pool members, pro-rata to units",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:distribute 400e18 xDAIx to $rewards`,
    },
  ],
});
