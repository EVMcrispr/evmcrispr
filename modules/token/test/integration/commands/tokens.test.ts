import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, OTHER_ADDRESS, SOME_ADDRESS } from "../../fixtures";

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

describeCommand("transfer", {
  describeName: "Token > commands > transfer <token> <to> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a transfer action",
      script: `token:transfer ${GNO} ${SOME_ADDRESS} 100e18`,
      expectedActions: [
        encodeAction(GNO, "transfer(address,uint256)", [
          SOME_ADDRESS,
          Num(100000000000000000000n),
        ]),
      ],
    },
  ],
});

describeCommand("transfer-from", {
  describeName: "Token > commands > transfer-from <token> <from> <to> <amount>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode a transferFrom action",
      script: `token:transfer-from ${GNO} ${SOME_ADDRESS} ${OTHER_ADDRESS} 100e18`,
      expectedActions: [
        encodeAction(GNO, "transferFrom(address,address,uint256)", [
          SOME_ADDRESS,
          OTHER_ADDRESS,
          Num(100000000000000000000n),
        ]),
      ],
    },
  ],
});

describeCommand("disperse", {
  describeName: "Token > commands > disperse <token> <recipients> <amounts>",
  module: "token",
  preamble: "load token",
  cases: [
    {
      name: "should encode one transfer per recipient",
      script: `token:disperse ${GNO} [${SOME_ADDRESS} ${OTHER_ADDRESS}] [100e18 50e18]`,
      expectedActions: [
        encodeAction(GNO, "transfer(address,uint256)", [
          SOME_ADDRESS,
          Num(100000000000000000000n),
        ]),
        encodeAction(GNO, "transfer(address,uint256)", [
          OTHER_ADDRESS,
          Num(50000000000000000000n),
        ]),
      ],
    },
    {
      name: "should send a single amount to every recipient",
      script: `token:disperse ${GNO} [${SOME_ADDRESS} ${OTHER_ADDRESS}] 10e18`,
      expectedActions: [
        encodeAction(GNO, "transfer(address,uint256)", [
          SOME_ADDRESS,
          Num(10000000000000000000n),
        ]),
        encodeAction(GNO, "transfer(address,uint256)", [
          OTHER_ADDRESS,
          Num(10000000000000000000n),
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail when recipients is empty",
      script: `token:disperse ${GNO} [] 100e18`,
      error: "<recipients> must not be empty",
    },
    {
      name: "should fail when a recipient is not an address",
      script: `token:disperse ${GNO} [42] 100e18`,
      error: "<recipients> must contain addresses",
    },
    {
      name: "should fail when amounts length does not match recipients",
      script: `token:disperse ${GNO} [${SOME_ADDRESS}] [100e18 50e18]`,
      error: "does not match <recipients> length",
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
