import "../../setup";

import { ANY_ENTITY } from "@evmcrispr/module-aragonos/utils";
import { CommandError } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";
import { DAO } from "../../fixtures";
import {
  createTestAction,
  createTestScriptEncodedAction,
} from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos --as ar\nar:connect ${DAO.kernel} (`;

describeCommand("forward", {
  describeName: "AragonOS > commands > forward <...path> <commandsBlock>",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct forward action",
      script: `
      forward @app(disputable-voting.open) (
        grant @app(disputable-voting.open) @app(disputable-conviction-voting.open) PAUSE_CONTRACT_ROLE @app(disputable-voting.open)
        revoke @ANY_ENTITY @app(disputable-conviction-voting.open) CREATE_PROPOSALS_ROLE true
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
      grant @app(tollgate.open) @app(finance) CREATE_PAYMENTS_ROLE
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
    grant @app(disputable-voting.open) @app(disputable-conviction-voting.open) PAUSE_CONTRACT_ROLE @app(disputable-voting.open)
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
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  forward non-defined-address (\n    grant @app(tollgate.open) @app(finance) CREATE_PAYMENTS_ROLE\n  )\n)`,
      error: "non-defined-address",
    },
  ],
});
