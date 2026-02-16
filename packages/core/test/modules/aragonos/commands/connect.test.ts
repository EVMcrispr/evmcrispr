import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import type AragonOS from "@evmcrispr/module-aragonos";
import { MINIME_TOKEN_FACTORIES } from "@evmcrispr/module-aragonos/utils";
import { buildNonceForAddress } from "@evmcrispr/module-aragonos/utils/nonces";
import {
  CommandError,
  encodeAction,
  encodeCalldata,
  toDecimals,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import {
  getContractAddress,
  keccak256,
  parseAbiItem,
  toHex,
  zeroAddress,
} from "viem";
import { DAO } from "../../../fixtures/mock-dao.js";
import { DAO as DAO2 } from "../../../fixtures/mock-dao-2.js";
import { DAO as DAO3 } from "../../../fixtures/mock-dao-3.js";
import { getPublicClient } from "../../../test-helpers/client.js";
import { TEST_ACCOUNT_ADDRESS } from "../../../test-helpers/constants.js";
import { createInterpreter } from "../../../test-helpers/evml.js";
import { expectThrowAsync } from "../../../test-helpers/expects.js";
import { APP } from "../fixtures/mock-app.js";
import {
  COMPLETE_FORWARDER_PATH,
  FEE_AMOUNT,
  FEE_FORWARDER,
  FEE_TOKEN_ADDRESS,
} from "../fixtures/mock-forwarders.js";
import {
  createTestAction,
  createTestPreTxAction,
  createTestScriptEncodedAction,
} from "../test-helpers/actions.js";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../test-helpers/aragonos.js";

const DAOs = [DAO, DAO2, DAO3];

describe("AragonOS > commands > connect <daoNameOrAddress> <commandsBlock>", () => {
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

  it("should return the correct actions when defining a complete forwarding path via forward command", async () => {
    const interpreter = createInterpreter(
      `
        load aragonos --as ar

        ar:connect ${DAO3.kernel} (
          forward ${COMPLETE_FORWARDER_PATH.map((f) => `@app(${f})`).join(" ")} (
            grant @me agent TRANSFER_ROLE
            grant dandelion-voting.1hive token-manager ISSUE_ROLE dandelion-voting.1hive
            revoke dandelion-voting.1hive tollgate.1hive CHANGE_AMOUNT_ROLE true
            new-token "Other Token" OT token-manager:new
            install token-manager:new token:OT true 0
            act agent agent:1 "transfer(address,address,uint256)" @token(DAI) @me 10.50e18
          )
        )
      `,
      client,
    );

    const forwardingAction = await interpreter.interpret();

    const me = TEST_ACCOUNT_ADDRESS;
    const chainId = await client.getChainId();
    const { appId, codeAddress, initializeSignature } = APP;
    const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(chainId)!;
    const newTokenAddress = getContractAddress({
      from: tokenFactoryAddress,
      nonce: await buildNonceForAddress(tokenFactoryAddress, 0, client!),
    });

    const expectedForwardingActions = [
      createTestPreTxAction("approve", FEE_TOKEN_ADDRESS, [
        DAO3[FEE_FORWARDER],
        FEE_AMOUNT,
      ]),
      createTestScriptEncodedAction(
        [
          createTestAction("grantPermission", DAO3.acl, [
            me,
            DAO3.agent,
            keccak256(toHex("TRANSFER_ROLE")),
          ]),
          createTestAction("grantPermission", DAO3.acl, [
            DAO3["dandelion-voting.1hive"],
            DAO3["token-manager"],
            keccak256(toHex("ISSUE_ROLE")),
          ]),
          createTestAction("revokePermission", DAO3.acl, [
            DAO3["dandelion-voting.1hive"],
            DAO3["tollgate.1hive"],
            keccak256(toHex("CHANGE_AMOUNT_ROLE")),
          ]),
          createTestAction("removePermissionManager", DAO3.acl, [
            DAO3["tollgate.1hive"],
            keccak256(toHex("CHANGE_AMOUNT_ROLE")),
          ]),
          createTestAction(
            "createCloneToken",
            MINIME_TOKEN_FACTORIES.get(chainId)!,
            [zeroAddress, 0, "Other Token", 18, "OT", true],
          ),
          createTestAction("changeController", newTokenAddress, [
            getContractAddress({
              from: DAO3.kernel,
              nonce: await buildNonceForAddress(DAO3.kernel, 0, client!),
            }),
          ]),
          createTestAction("newAppInstance", DAO3.kernel, [
            appId,
            codeAddress,
            // biome-ignore lint/style/useTemplate: template literal breaks viem's type inference for parseAbiItem
            encodeCalldata(parseAbiItem([`function ` + initializeSignature]), [
              newTokenAddress,
              true,
              0,
            ]),
            false,
          ]),
          createTestScriptEncodedAction(
            [
              encodeAction(
                DAO3["agent:1"],
                "transfer(address,address,uint256)",
                [
                  "0x44fA8E6f47987339850636F88629646662444217",
                  me,
                  toDecimals("10.50"),
                ],
              ),
            ],
            ["agent"],
            DAO3,
          ),
        ],
        COMPLETE_FORWARDER_PATH,
        DAO3,
      ),
    ];

    expect(forwardingAction).to.eqls(expectedForwardingActions);
  });

  it("should set connected DAO variable", async () => {
    const interpreter = createAragonScriptInterpreter();
    await interpreter.interpret();
    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);

    expect(dao).to.not.be.null;
    expect(dao!.nestingIndex, "DAO nested index mismatch").to.equals(1);
    Object.entries(DAO).forEach(([appIdentifier, appAddress]) => {
      expect(
        dao!.resolveApp(appIdentifier)!.address,
        `${appIdentifier} binding mismatch`,
      ).equals(appAddress);
    });
  });

  describe("when having nested connect commands", () => {
    it("should set all the connected DAOs properly", async () => {
      const interpreter = createInterpreter(
        `
          load aragonos --as ar

          ar:connect ${DAO.kernel} (
            connect ${DAO2.kernel} (
              std:set $var1 1
              connect ${DAO3.kernel} (
                std:set $var2 token-manager
              )
            )
          )
        `,
        client,
      );

      await interpreter.interpret();

      const aragonos = interpreter.getModule("aragonos") as AragonOS;
      const daos = aragonos.connectedDAOs;

      expect(daos, "connected DAOs length mismatch").to.be.lengthOf(3);

      let i = 0;
      for (const dao of daos) {
        expect(dao.nestingIndex, `DAO ${i} nesting index mismatch`).to.equals(
          i + 1,
        );
        Object.entries(DAOs[i]).forEach(([appIdentifier, appAddress]) => {
          expect(
            dao!.resolveApp(appIdentifier)!.address,
            `DAO ${i} ${appIdentifier} binding mismatch`,
          ).equals(appAddress);
        });
        i++;
      }
    });

    it("should return the correct actions when using app identifiers from different DAOs", async () => {
      const interpreter = createInterpreter(
        `
          load aragonos --as ar

          ar:connect ${DAO.kernel} (
            connect ${DAO2.kernel} (
              grant disputable-voting.open _${DAO.kernel}:agent TRANSFER_ROLE
              connect ${DAO3.kernel} (
                grant _${DAO.kernel}:disputable-voting.open _${DAO2.kernel}:acl CREATE_PERMISSIONS_ROLE
              )
            )
            
          )
        `,
        client,
      );

      const nestedActions = await interpreter.interpret();

      const expectedNestedActions = [
        createTestAction("grantPermission", DAO.acl, [
          DAO2["disputable-voting.open"],
          DAO.agent,
          keccak256(toHex("TRANSFER_ROLE")),
        ]),
        createTestAction("grantPermission", DAO2.acl, [
          DAO["disputable-voting.open"],
          DAO2.acl,
          keccak256(toHex("CREATE_PERMISSIONS_ROLE")),
        ]),
      ];

      expect(nestedActions).to.eql(expectedNestedActions);
    });

    it("should fail when trying to connect to an already connected DAO", async () => {
      const interpreter = createInterpreter(
        `
      load aragonos --as ar

      ar:connect ${DAO.kernel} (
        connect ${DAO.kernel} (

        )
      )
      `,
        client,
      );

      const connectNode = findAragonOSCommandNode(
        interpreter.ast,
        "connect",
        1,
      )!;
      const error = new CommandError(
        connectNode,
        `trying to connect to an already connected DAO (${DAO.kernel})`,
      );
      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  });

  it("should fail when not passing a commands block", async () => {
    const interpreter = createInterpreter(
      `
    load aragonos --as ar
    ar:connect ${DAO.kernel}
  `,
      client,
    );
    const c = findAragonOSCommandNode(interpreter.ast, "connect")!;
    const error = new CommandError(c, "<block> must be a block expression");

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
