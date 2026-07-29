import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

describeCommand("begin-default-admin-transfer", {
  describeName:
    "AccessControl > commands > begin-default-admin-transfer <contract> <newAdmin>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode a beginDefaultAdminTransfer action",
      script: `acl:begin-default-admin-transfer ${TOKEN_DISTRO} ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "beginDefaultAdminTransfer(address)", [
          SOME_ADDRESS,
        ]),
      ],
    },
  ],
});

describeCommand("accept-default-admin-transfer", {
  describeName:
    "AccessControl > commands > accept-default-admin-transfer <contract>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode an acceptDefaultAdminTransfer action",
      script: `acl:accept-default-admin-transfer ${TOKEN_DISTRO}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "acceptDefaultAdminTransfer()", []),
      ],
    },
  ],
});

describeCommand("cancel-default-admin-transfer", {
  describeName:
    "AccessControl > commands > cancel-default-admin-transfer <contract>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode a cancelDefaultAdminTransfer action",
      script: `acl:cancel-default-admin-transfer ${TOKEN_DISTRO}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "cancelDefaultAdminTransfer()", []),
      ],
    },
  ],
});

describeCommand("change-default-admin-delay", {
  describeName:
    "AccessControl > commands > change-default-admin-delay <contract> <delay>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode a changeDefaultAdminDelay action",
      script: `acl:change-default-admin-delay ${TOKEN_DISTRO} 172800`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "changeDefaultAdminDelay(uint48)", [
          Num(172800n),
        ]),
      ],
    },
  ],
});

describeCommand("rollback-default-admin-delay", {
  describeName:
    "AccessControl > commands > rollback-default-admin-delay <contract>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode a rollbackDefaultAdminDelay action",
      script: `acl:rollback-default-admin-delay ${TOKEN_DISTRO}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "rollbackDefaultAdminDelay()", []),
      ],
    },
  ],
});
