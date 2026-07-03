import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, SOME_ADDRESS } from "../../fixtures";

describeCommand("mint", {
  describeName: "Token > commands > mint <token> <to> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a mint action",
      script: `token:mint ${GNO} ${SOME_ADDRESS} 100e18`,
      expectedActions: [
        encodeAction(GNO, "mint(address,uint256)", [
          SOME_ADDRESS,
          Num(100000000000000000000n),
        ]),
      ],
    },
  ],
});

describeCommand("burn", {
  describeName: "Token > commands > burn <token> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a burn action",
      script: `token:burn ${GNO} 100e18`,
      expectedActions: [
        encodeAction(GNO, "burn(uint256)", [Num(100000000000000000000n)]),
      ],
    },
  ],
});

describeCommand("burn-from", {
  describeName: "Token > commands > burn-from <token> <from> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a burnFrom action",
      script: `token:burn-from ${GNO} ${SOME_ADDRESS} 100e18`,
      expectedActions: [
        encodeAction(GNO, "burnFrom(address,uint256)", [
          SOME_ADDRESS,
          Num(100000000000000000000n),
        ]),
      ],
    },
  ],
});

describeCommand("approve", {
  describeName: "Token > commands > approve <token> <spender> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode an approve action",
      script: `token:approve ${GNO} ${SOME_ADDRESS} 100e18`,
      expectedActions: [
        encodeAction(GNO, "approve(address,uint256)", [
          SOME_ADDRESS,
          Num(100000000000000000000n),
        ]),
      ],
    },
  ],
});

describeCommand("set-approval-for-all", {
  describeName:
    "Token > commands > set-approval-for-all <token> <operator> <approved>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a setApprovalForAll action",
      script: `token:set-approval-for-all ${GNO} ${SOME_ADDRESS} true`,
      expectedActions: [
        encodeAction(GNO, "setApprovalForAll(address,bool)", [
          SOME_ADDRESS,
          true,
        ]),
      ],
    },
  ],
});
