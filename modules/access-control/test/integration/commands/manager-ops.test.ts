import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";
const setDurationData = encodeAction(TOKEN_DISTRO, "setDuration(uint256)", [
  Num(1n),
]).data!;

describeCommand("schedule", {
  describeName:
    "AccessControl > commands > schedule <manager> <target> <signature> [params] [--when]",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a schedule action with when = 0 by default",
      script: `access-control:schedule ${MANAGER} ${TOKEN_DISTRO} setDuration(uint256) 1`,
      expectedActions: [
        encodeAction(MANAGER, "schedule(address,bytes,uint48)", [
          TOKEN_DISTRO,
          setDurationData,
          Num(0n),
        ]),
      ],
    },
    {
      name: "should encode an explicit --when timestamp",
      script: `access-control:schedule ${MANAGER} ${TOKEN_DISTRO} setDuration(uint256) 1 --when 1700000000`,
      expectedActions: [
        encodeAction(MANAGER, "schedule(address,bytes,uint48)", [
          TOKEN_DISTRO,
          setDurationData,
          Num(1700000000n),
        ]),
      ],
    },
  ],
});

describeCommand("execute-scheduled", {
  describeName:
    "AccessControl > commands > execute-scheduled <manager> <target> <signature> [params] [--value]",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode an execute action",
      script: `access-control:execute-scheduled ${MANAGER} ${TOKEN_DISTRO} setDuration(uint256) 1`,
      expectedActions: [
        encodeAction(MANAGER, "execute(address,bytes)", [
          TOKEN_DISTRO,
          setDurationData,
        ]),
      ],
    },
    {
      name: "should forward --value",
      script: `access-control:execute-scheduled ${MANAGER} ${TOKEN_DISTRO} setDuration(uint256) 1 --value 1e18`,
      expectedActions: [
        encodeAction(
          MANAGER,
          "execute(address,bytes)",
          [TOKEN_DISTRO, setDurationData],
          { value: 1000000000000000000n },
        ),
      ],
    },
  ],
});

describeCommand("cancel-scheduled", {
  describeName:
    "AccessControl > commands > cancel-scheduled <manager> <caller> <target> <signature> [params]",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a cancel action",
      script: `access-control:cancel-scheduled ${MANAGER} ${SOME_ADDRESS} ${TOKEN_DISTRO} setDuration(uint256) 1`,
      expectedActions: [
        encodeAction(MANAGER, "cancel(address,address,bytes)", [
          SOME_ADDRESS,
          TOKEN_DISTRO,
          setDurationData,
        ]),
      ],
    },
  ],
});
