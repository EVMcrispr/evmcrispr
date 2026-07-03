import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { toFunctionSelector } from "viem";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";
const MAX_UINT64 = Num(2n ** 64n - 1n);

describeCommand("set-role-admin", {
  describeName:
    "AccessControl > commands > set-role-admin <manager> <roleId> <adminRoleId>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a setRoleAdmin action",
      script: `access-control:set-role-admin ${MANAGER} 42 2`,
      expectedActions: [
        encodeAction(MANAGER, "setRoleAdmin(uint64,uint64)", [
          Num(42n),
          Num(2n),
        ]),
      ],
    },
    {
      name: "should accept role aliases",
      script: `access-control:set-role-admin ${MANAGER} 42 ADMIN_ROLE`,
      expectedActions: [
        encodeAction(MANAGER, "setRoleAdmin(uint64,uint64)", [
          Num(42n),
          Num(0n),
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should reject AccessControl-style string roles",
      script: `access-control:set-role-admin ${MANAGER} MINTER_ROLE 2`,
      error: "role ids must be integers",
    },
  ],
});

describeCommand("set-role-guardian", {
  describeName:
    "AccessControl > commands > set-role-guardian <manager> <roleId> <guardianRoleId>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a setRoleGuardian action",
      script: `access-control:set-role-guardian ${MANAGER} 42 3`,
      expectedActions: [
        encodeAction(MANAGER, "setRoleGuardian(uint64,uint64)", [
          Num(42n),
          Num(3n),
        ]),
      ],
    },
  ],
});

describeCommand("label-role", {
  describeName:
    "AccessControl > commands > label-role <manager> <roleId> <label>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a labelRole action",
      script: `access-control:label-role ${MANAGER} 42 "Treasury manager"`,
      expectedActions: [
        encodeAction(MANAGER, "labelRole(uint64,string)", [
          Num(42n),
          "Treasury manager",
        ]),
      ],
    },
  ],
});

describeCommand("set-target-closed", {
  describeName:
    "AccessControl > commands > set-target-closed <manager> <target> <closed>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a setTargetClosed action",
      script: `access-control:set-target-closed ${MANAGER} ${TOKEN_DISTRO} true`,
      expectedActions: [
        encodeAction(MANAGER, "setTargetClosed(address,bool)", [
          TOKEN_DISTRO,
          true,
        ]),
      ],
    },
  ],
});

describeCommand("set-target-function-role", {
  describeName:
    "AccessControl > commands > set-target-function-role <manager> <target> <roleId> <signatures>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should convert signatures to selectors and encode the action",
      script: `access-control:set-target-function-role ${MANAGER} ${TOKEN_DISTRO} 42 ["mint(address,uint256)" "burn(uint256)"]`,
      expectedActions: [
        encodeAction(
          MANAGER,
          "setTargetFunctionRole(address,bytes4[],uint64)",
          [
            TOKEN_DISTRO,
            [
              toFunctionSelector("function mint(address,uint256)"),
              toFunctionSelector("function burn(uint256)"),
            ],
            Num(42n),
          ],
        ),
      ],
    },
    {
      name: "should accept the PUBLIC_ROLE alias",
      script: `access-control:set-target-function-role ${MANAGER} ${TOKEN_DISTRO} PUBLIC_ROLE ["pause()"]`,
      expectedActions: [
        encodeAction(
          MANAGER,
          "setTargetFunctionRole(address,bytes4[],uint64)",
          [TOKEN_DISTRO, [toFunctionSelector("function pause()")], MAX_UINT64],
        ),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail on malformed signatures",
      script: `access-control:set-target-function-role ${MANAGER} ${TOKEN_DISTRO} 42 ["not a signature"]`,
      error: "invalid function signature",
    },
    {
      name: "should fail when signatures is not an array",
      script: `access-control:set-target-function-role ${MANAGER} ${TOKEN_DISTRO} 42 ${SOME_ADDRESS}`,
      error: "must be an array",
    },
  ],
});
