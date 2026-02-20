import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import { ANY_ENTITY } from "@evmcrispr/module-aragonos/utils";
import { CommandError } from "@evmcrispr/sdk";
import {
  createInterpreter,
  expect,
  expectThrowAsync,
  getPublicClient,
  itChecksNonDefinedIdentifier,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";
import { DAO } from "../../fixtures";
import {
  createTestAction,
  createTestScriptEncodedAction,
} from "../../test-helpers/actions";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";

describe("AragonOS > commands > forward <...path> <commandsBlock>", () => {
  let client: PublicClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  beforeAll(async () => {
    client = getPublicClient();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      client,
      DAO.kernel,
    );
  });

  it("should return a correct forward action", async () => {
    const interpreter = createAragonScriptInterpreter([
      `
      forward @app(disputable-voting.open) (
        grant @app(disputable-voting.open) @app(disputable-conviction-voting.open) PAUSE_CONTRACT_ROLE @app(disputable-voting.open)
        revoke @ANY_ENTITY @app(disputable-conviction-voting.open) CREATE_PROPOSALS_ROLE true
      ) --context "test"
    `,
    ]);

    const forwardActions = await interpreter.interpret();

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
  });

  itChecksNonDefinedIdentifier(
    "should fail when receiving non-defined forwarder identifiers",
    (nonDefinedIdentifier) =>
      createInterpreter(
        `
        load aragonos --as ar

        ar:connect ${DAO.kernel} (
          forward ${nonDefinedIdentifier} (
            grant @app(tollgate.open) @app(finance) CREATE_PAYMENTS_ROLE
          )
        )
      `,
        client,
      ),
    "forward",
    0,
    true,
  );

  it("should fail when forwarding actions through invalid forwarder addresses", async () => {
    const interpreter = createAragonScriptInterpreter([
      `forward false 0xab123cd1231255ab45323de234223422a12312321abaceff (
      grant @app(tollgate.open) @app(finance) CREATE_PAYMENTS_ROLE
    )`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "forward")!;
    const error = new CommandError(
      c,
      `<forwarders> must be a valid address, got false`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when forwarding actions through non-forwarder entities", async () => {
    const interpreter = createAragonScriptInterpreter([
      `forward @app(acl) (
    grant @app(disputable-voting.open) @app(disputable-conviction-voting.open) PAUSE_CONTRACT_ROLE @app(disputable-voting.open)
  )`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "forward")!;
    const error = new CommandError(c, `app ${DAO.acl} is not a forwarder`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
