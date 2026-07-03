import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { GNO, SOME_ADDRESS } from "../../fixtures";

const GOVERNOR = "0x2222222222222222222222222222222222222222";
const DESCRIPTION = "Fund the grants program";
const DESCRIPTION_HASH = keccak256(toHex(DESCRIPTION));

const BLOCK = `(
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18
)`;
const transferData = encodeAction(GNO, "transfer(address,uint256)", [
  SOME_ADDRESS,
  Num(100000000000000000000n),
]).data!;

describeCommand("queue", {
  describeName: "Governor > commands > queue <governor> <description> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a queue action with the hashed description",
      script: `governor:queue ${GOVERNOR} "${DESCRIPTION}" ${BLOCK}`,
      expectedActions: [
        encodeAction(GOVERNOR, "queue(address[],uint256[],bytes[],bytes32)", [
          [GNO],
          [Num(0n)],
          [transferData],
          DESCRIPTION_HASH,
        ]),
      ],
    },
  ],
});

describeCommand("execute", {
  describeName:
    "Governor > commands > execute <governor> <description> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode an execute action with the hashed description",
      script: `governor:execute ${GOVERNOR} "${DESCRIPTION}" ${BLOCK}`,
      expectedActions: [
        encodeAction(GOVERNOR, "execute(address[],uint256[],bytes[],bytes32)", [
          [GNO],
          [Num(0n)],
          [transferData],
          DESCRIPTION_HASH,
        ]),
      ],
    },
    {
      name: "should forward the total action value",
      script: `governor:execute ${GOVERNOR} "${DESCRIPTION}" (
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18 --value 1e18
)`,
      expectedActions: [
        encodeAction(
          GOVERNOR,
          "execute(address[],uint256[],bytes[],bytes32)",
          [
            [GNO],
            [Num(1000000000000000000n)],
            [transferData],
            DESCRIPTION_HASH,
          ],
          { value: 1000000000000000000n },
        ),
      ],
    },
  ],
});

describeCommand("cancel", {
  describeName: "Governor > commands > cancel <governor> <description> <block>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a cancel action with the hashed description",
      script: `governor:cancel ${GOVERNOR} "${DESCRIPTION}" ${BLOCK}`,
      expectedActions: [
        encodeAction(GOVERNOR, "cancel(address[],uint256[],bytes[],bytes32)", [
          [GNO],
          [Num(0n)],
          [transferData],
          DESCRIPTION_HASH,
        ]),
      ],
    },
  ],
});

describeCommand("vote", {
  describeName:
    "Governor > commands > vote <governor> <proposalId> <support> [--reason]",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a castVote action",
      script: `governor:vote ${GOVERNOR} 1 for`,
      expectedActions: [
        encodeAction(GOVERNOR, "castVote(uint256,uint8)", [Num(1n), Num(1n)]),
      ],
    },
    {
      name: "should accept numeric support values",
      script: `governor:vote ${GOVERNOR} 1 0`,
      expectedActions: [
        encodeAction(GOVERNOR, "castVote(uint256,uint8)", [Num(1n), Num(0n)]),
      ],
    },
    {
      name: "should encode castVoteWithReason when --reason is given",
      script: `governor:vote ${GOVERNOR} 1 against --reason "Treasury impact"`,
      expectedActions: [
        encodeAction(GOVERNOR, "castVoteWithReason(uint256,uint8,string)", [
          Num(1n),
          Num(0n),
          "Treasury impact",
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail on invalid support values",
      script: `governor:vote ${GOVERNOR} 1 maybe`,
      error: "must be for, against or abstain",
    },
  ],
});

describeCommand("delegate", {
  describeName: "Governor > commands > delegate <token> <delegatee>",
  module: "governor",
  preamble: "load governor",
  cases: [
    {
      name: "should encode a delegate action",
      script: `governor:delegate ${GNO} ${SOME_ADDRESS}`,
      expectedActions: [encodeAction(GNO, "delegate(address)", [SOME_ADDRESS])],
    },
  ],
});
