import "../../setup";
import { BindingsSpace, encodeAction, Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { hashOperationBatchLocal } from "../../../src/utils";
import { GNO, SOME_ADDRESS } from "../../fixtures";

const TIMELOCK = "0x3333333333333333333333333333333333333333";
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;
const SALT =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";

const BLOCK = `(
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18
)`;
const transferData = encodeAction(GNO, "transfer(address,uint256)", [
  SOME_ADDRESS,
  Num(100000000000000000000n),
]).data!;

describeCommand("timelock-schedule", {
  describeName:
    "Governor > commands > timelock-schedule [$id] <timelock> <delay> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a scheduleBatch action with default predecessor and salt",
      script: `governor:timelock-schedule ${TIMELOCK} 86400 ${BLOCK}`,
      expectedActions: [
        encodeAction(
          TIMELOCK,
          "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
          [
            [GNO],
            [Num(0n)],
            [transferData],
            ZERO_BYTES32,
            ZERO_BYTES32,
            Num(86400n),
          ],
        ),
      ],
    },
    {
      name: "should encode --predecessor and --salt",
      script: `governor:timelock-schedule ${TIMELOCK} 86400 --salt ${SALT} ${BLOCK}`,
      expectedActions: [
        encodeAction(
          TIMELOCK,
          "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
          [[GNO], [Num(0n)], [transferData], ZERO_BYTES32, SALT, Num(86400n)],
        ),
      ],
    },
    {
      name: "should bind the operation id to the optional variable",
      script: `governor:timelock-schedule $opId ${TIMELOCK} 86400 --salt ${SALT} ${BLOCK}`,
      validate: (_result, interpreter) => {
        const bound = interpreter.getBinding("$opId", BindingsSpace.USER);
        expect(bound).to.equal(
          hashOperationBatchLocal(
            [GNO],
            [0n],
            [transferData],
            ZERO_BYTES32,
            SALT,
          ),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on an empty block",
      script: `governor:timelock-schedule ${TIMELOCK} 86400 (
)`,
      error: "must contain at least one action",
    },
  ],
});

describeCommand("timelock-execute", {
  describeName: "Governor > commands > timelock-execute <timelock> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode an executeBatch action",
      script: `governor:timelock-execute ${TIMELOCK} ${BLOCK}`,
      expectedActions: [
        encodeAction(
          TIMELOCK,
          "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
          [[GNO], [Num(0n)], [transferData], ZERO_BYTES32, ZERO_BYTES32],
        ),
      ],
    },
    {
      name: "should forward the total action value",
      script: `governor:timelock-execute ${TIMELOCK} (
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18 --value 1e18
)`,
      expectedActions: [
        encodeAction(
          TIMELOCK,
          "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
          [
            [GNO],
            [Num(1000000000000000000n)],
            [transferData],
            ZERO_BYTES32,
            ZERO_BYTES32,
          ],
          { value: 1000000000000000000n },
        ),
      ],
    },
  ],
});

describeCommand("timelock-cancel", {
  describeName:
    "Governor > commands > timelock-cancel <timelock> <operationId>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a cancel action",
      script: `governor:timelock-cancel ${TIMELOCK} ${SALT}`,
      expectedActions: [encodeAction(TIMELOCK, "cancel(bytes32)", [SALT])],
    },
  ],
});
