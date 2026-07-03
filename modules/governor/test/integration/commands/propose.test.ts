import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const GOVERNOR = "0x2222222222222222222222222222222222222222";

const transferData = encodeAction(GNO, "transfer(address,uint256)", [
  SOME_ADDRESS,
  Num(100000000000000000000n),
]).data!;
const setDurationData = encodeAction(TOKEN_DISTRO, "setDuration(uint256)", [
  Num(1n),
]).data!;

describeCommand("propose", {
  describeName:
    "Governor > commands > propose <governor> <description> <block>",
  module: "governor",
  preamble: "load governor\nload access-control",
  cases: [
    {
      name: "should collect block actions into a propose action",
      script: `governor:propose ${GOVERNOR} "Fund the grants program" (
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18
  exec ${TOKEN_DISTRO} setDuration(uint256) 1
)`,
      expectedActions: [
        encodeAction(GOVERNOR, "propose(address[],uint256[],bytes[],string)", [
          [GNO, TOKEN_DISTRO],
          [Num(0n), Num(0n)],
          [transferData, setDurationData],
          "Fund the grants program",
        ]),
      ],
    },
    {
      name: "should carry action values into the values array",
      script: `governor:propose ${GOVERNOR} "Send ETH" (
  exec ${GNO} transfer(address,uint256) ${SOME_ADDRESS} 100e18 --value 1e18
)`,
      expectedActions: [
        encodeAction(GOVERNOR, "propose(address[],uint256[],bytes[],string)", [
          [GNO],
          [Num(1000000000000000000n)],
          [transferData],
          "Send ETH",
        ]),
      ],
    },
    {
      name: "should support commands from other modules inside the block",
      script: `governor:propose ${GOVERNOR} "New owner" (
  access-control:transfer-ownership ${GNO} ${SOME_ADDRESS}
)`,
      expectedActions: [
        encodeAction(GOVERNOR, "propose(address[],uint256[],bytes[],string)", [
          [GNO],
          [Num(0n)],
          [
            encodeAction(GNO, "transferOwnership(address)", [SOME_ADDRESS])
              .data!,
          ],
          "New owner",
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail on an empty block",
      script: `governor:propose ${GOVERNOR} "Nothing" (
)`,
      error: "must contain at least one action",
    },
    {
      name: "should fail on non-transaction actions inside the block",
      script: `governor:propose ${GOVERNOR} "Switch" (
  switch 1
)`,
      error: "cannot be used inside governor:propose",
    },
  ],
});
