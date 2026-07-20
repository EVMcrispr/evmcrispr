import "../../setup";

import { ANY_ENTITY } from "@evmcrispr/module-aragonos/utils";
import { CommandError } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { DAO } from "../../fixtures";
import {
  createTestAction,
  createTestScriptEncodedAction,
} from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos [forward grant revoke @app @ANY_ENTITY]\naragonos:connect ${DAO.kernel} (`;

describeCommand("forward", {
  describeName: "AragonOS > commands > forward <...path> <commandsBlock>",
  module: "aragonos",
  preamble,
  docCases: [
    {
      description: "Forward through voting to modify permissions",
      code: `aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  aragonos:forward @aragonos:app(disputable-voting.open) (\n    aragonos:grant PAUSE_CONTRACT_ROLE on @aragonos:app(disputable-conviction-voting.open) to @aragonos:app(disputable-voting.open) @aragonos:app(disputable-voting.open)\n  ) --context "Modify permissions"\n)`,
    },
  ],
  cases: [
    {
      name: "should return a correct forward action",
      script: `
      forward @app(disputable-voting.open) (
        grant PAUSE_CONTRACT_ROLE on @app(disputable-conviction-voting.open) to @app(disputable-voting.open) @app(disputable-voting.open)
        revoke CREATE_PROPOSALS_ROLE on @app(disputable-conviction-voting.open) from @ANY_ENTITY true
      ) --context "test"
    \n)`,
      validate: async (forwardActions) => {
        const expectedActions = [
          createTestScriptEncodedAction(
            [
              createTestAction("createPermission", DAO.acl, [
                DAO["disputable-voting.open"],
                DAO["disputable-conviction-voting.open"],
                keccak256(toHex("PAUSE_CONTRACT_ROLE")),
                DAO["disputable-voting.open"],
              ]),
              createTestAction("revokePermission", DAO.acl, [
                ANY_ENTITY,
                DAO["disputable-conviction-voting.open"],
                keccak256(toHex("CREATE_PROPOSALS_ROLE")),
              ]),
              createTestAction("removePermissionManager", DAO.acl, [
                DAO["disputable-conviction-voting.open"],
                keccak256(toHex("CREATE_PROPOSALS_ROLE")),
              ]),
            ],
            ["disputable-voting.open"],
            DAO,
            "test",
          ),
        ];
        expect(forwardActions).to.eql(expectedActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when forwarding actions through invalid forwarder addresses",
      script: `forward false 0xab123cd1231255ab45323de234223422a12312321abaceff (
      grant CREATE_PAYMENTS_ROLE on @app(finance) to @app(tollgate.open)
    )\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "forward")!;
        return new CommandError(
          c,
          `<forwarders> must be a valid address, got false`,
        );
      },
    },
    {
      name: "should fail when forwarding actions through non-forwarder entities",
      script: `forward @app(acl) (
    grant PAUSE_CONTRACT_ROLE on @app(disputable-conviction-voting.open) to @app(disputable-voting.open) @app(disputable-voting.open)
  )\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "forward")!;
        return new CommandError(c, `app ${DAO.acl} is not a forwarder`);
      },
    },
  ],
});

describeCommand("forward", {
  describeName: "AragonOS > commands > forward > non-defined identifiers",
  module: "aragonos",
  errorCases: [
    {
      name: "should fail when receiving non-defined forwarder identifiers",
      script: `load aragonos [forward grant @app]\naragonos:connect ${DAO.kernel} (\n  forward non-defined-address (\n    grant CREATE_PAYMENTS_ROLE on @app(finance) to @app(tollgate.open)\n  )\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail on non-batchable commands inside the forward block",
      script: `load aragonos [forward @app]\naragonos:connect ${DAO.kernel} (\n  forward @app(disputable-voting.open) (\n    switch 1\n  )\n)`,
      error: 'command "switch" cannot be used inside forward',
    },
  ],
});
