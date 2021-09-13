import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Action, ActionFunction, ErrorInvalid, EVMcrispr } from "../src";
import {
  APP,
  CONTEXT,
  DAO,
  COMPLETE_FORWARDER_PATH,
  getSignatureSelector,
  GRANT_PERMISSION,
  NEW_PERMISSIONS,
  PERMISSION_MANAGER,
  resolveApp,
  resolvePermission,
  REVOKE_PERMISSIONS,
  FEE_TOKEN_ADDRESS,
  FEE_AMOUNT,
  FEE_FORWARDER,
} from "./test-helpers/mock-data";
import { encodeActCall } from "../src/helpers";
import { createTestAction, createTestPreTxAction, createTestScriptEncodedAction } from "./test-helpers/actions";
import { expectThrowAsync, isValidIdentifier } from "./test-helpers/expects";

describe("EVMcrispr script-encoding functions", () => {
  let evmcrispr: EVMcrispr;
  let signer: SignerWithAddress;
  let expectedActions: Action[];
  let actionFunctions: ActionFunction[];

  before(async () => {
    signer = (await ethers.getSigners())[0];

    evmcrispr = await EVMcrispr.create(signer, DAO.kernel);
  });

  before(() => {
    const { acl, kernel } = DAO;
    const {
      appId,
      appIdentifier,
      callSignature,
      callSignatureParams,
      codeAddress,
      initializeParams,
      initializeSignature,
    } = APP;
    const callSelector = getSignatureSelector(callSignature);

    // Prepare test actions
    const installAction = createTestAction("installNewApp", kernel, [
      appId,
      codeAddress,
      encodeActCall(initializeSignature, initializeParams),
      false,
    ]);
    const addPermissionAction = NEW_PERMISSIONS.map((p) =>
      createTestAction("addPermission", acl, [...resolvePermission(p), resolveApp(PERMISSION_MANAGER)])
    );
    const grantPermissionAction = createTestAction("grantPermission", acl, resolvePermission(GRANT_PERMISSION));
    const revokePermissionActions = REVOKE_PERMISSIONS.reduce((actions: Action[], currentPermission) => {
      const resolvedPermission = resolvePermission(currentPermission);
      return [
        ...actions,
        createTestAction("revokePermission", acl, resolvedPermission),
        createTestAction("removePermissionManager", acl, resolvedPermission.slice(1, 3)),
      ];
    }, []);
    const callAppAction: Action = {
      to: resolveApp(appIdentifier),
      data: encodeActCall(callSignature, callSignatureParams),
    };
    expectedActions = [
      installAction,
      ...addPermissionAction,
      grantPermissionAction,
      ...revokePermissionActions,
      callAppAction,
    ];

    // Prepare EVMcrispr action functions
    actionFunctions = [
      evmcrispr.installNewApp(`${appIdentifier}:new-app`, initializeParams),
      evmcrispr.addPermissions([...NEW_PERMISSIONS, GRANT_PERMISSION], PERMISSION_MANAGER),
      evmcrispr.revokePermissions(REVOKE_PERMISSIONS, true),
      evmcrispr.call(`${appIdentifier}`)[callSelector](...callSignatureParams),
    ];
  });

  describe("encode()", () => {
    it("should fail when passing an empty group of actions", async () => {
      await expectThrowAsync(() => evmcrispr.encode([], COMPLETE_FORWARDER_PATH), { type: ErrorInvalid });
    });

    it("should fail when passing an empty set of forwarders", async () => {
      await expectThrowAsync(() => evmcrispr.encode(actionFunctions, []), { type: ErrorInvalid });
    });

    it(
      "should fail when passing an invalid set of forwarders",
      isValidIdentifier((badIdentifier) => () => evmcrispr.encode(actionFunctions, [badIdentifier]))
    );

    it("should fail when encoding a set of actions into an EVM script using a context forwarder and not receiving a context", async () => {
      const { appIdentifier, callSignature, callSignatureParams } = APP;
      const callSelector = getSignatureSelector(callSignature);

      await expectThrowAsync(
        () =>
          evmcrispr.encode(
            [evmcrispr.call(`${appIdentifier}`)[callSelector](...callSignatureParams)],
            COMPLETE_FORWARDER_PATH
          ),
        { type: ErrorInvalid }
      );
    });

    it("should encode a set of actions into an EVM script correctly using a path containing a fee, context and normal forwarder", async () => {
      const expectedEncodedScriptAction = createTestScriptEncodedAction(
        expectedActions,
        COMPLETE_FORWARDER_PATH,
        CONTEXT
      );
      const expectedEncodedPreTxActions = [
        createTestPreTxAction("approve", FEE_TOKEN_ADDRESS, [resolveApp(FEE_FORWARDER), FEE_AMOUNT]),
      ];
      const { action: encodedScriptAction, preTxActions } = await evmcrispr.encode(
        actionFunctions,
        COMPLETE_FORWARDER_PATH,
        { context: CONTEXT }
      );

      expect(preTxActions, "Fee pretransactions mismatch").eql(expectedEncodedPreTxActions);
      expect(encodedScriptAction, "EVM script action mismatch").eql(expectedEncodedScriptAction);
    });
  });

  describe("forward()", () => {});
});
