import { ethers } from "hardhat";
import { addressesEqual } from "@1hive/connect";
import { utils } from "ethers";
import { expect } from "chai";
import EVMcrispr from "../src/EVMcrispr";
import { ErrorException, ErrorInvalid, ErrorNotFound } from "../src/errors";
import { Action, Permission } from "../src/types";
import { encodeActCall, encodeCallScript } from "../src/helpers";
import {
  resolvePermission,
  ADDRESS,
  APP,
  DAO,
  GRANT_PERMISSION,
  GRANT_PERMISSION_PARAMS,
  NEW_PERMISSION,
  NEW_PERMISSION_PARAMS,
  PERMISSION_MANAGER,
  REVOKE_PERMISSION,
  REVOKE_PERMISSIONS,
  NEW_PERMISSIONS,
} from "./test-helpers/mock-data";
import { expectThrowAsync, isValidIdentifier } from "./test-helpers/expects";

describe("EVMcrispr action-encoding functions", () => {
  let evmcrispr: EVMcrispr;

  async function resetCrispr() {
    const signer = (await ethers.getSigners())[0];

    evmcrispr = await EVMcrispr.create(signer, DAO.kernel);
  }

  before(resetCrispr);

  const testBadPermission = (evmcrisprPermissionMethod: (badPermission: Permission) => any) => {
    it(
      "fails when receiving an invalid identifier as the permission's grantee",
      isValidIdentifier(
        (badIdentifier) => evmcrisprPermissionMethod([badIdentifier, "token-manager", "MINT_ROLE"]),
        false,
        false
      )
    );

    it(
      "fails when receiving an invalid identifier as the app holding the permission",
      isValidIdentifier(
        (badIdentifier) => evmcrisprPermissionMethod(["voting", badIdentifier, "MINT_ROLE"]),
        false,
        false
      )
    );

    it("fails when receiving a permission holder app address that doesn't match any DAO app", async () => {
      await expectThrowAsync(evmcrisprPermissionMethod(["voting", ADDRESS, "ROLE"]), {
        type: ErrorNotFound,
        name: "ErrorAppNotFound",
      });
    });

    it("fails when receiving an invalid hash role", async () => {
      await expectThrowAsync(
        evmcrisprPermissionMethod([
          "voting",
          "token-manager",
          "0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366",
        ]),
        { type: ErrorInvalid, name: "ErrorInvalidRole" },
        "Invalid hash role"
      );
    });

    it("fails when receiving a non-existent role", async () => {
      await expectThrowAsync(evmcrisprPermissionMethod(["voting", "token-manager", "NON_EXISTENT_ROLE"]), {
        type: ErrorNotFound,
      });
    });
  };

  describe("addPermission()", () => {
    testBadPermission((badPermission) => evmcrispr.addPermission(badPermission, "voting"));

    it(
      "fails when receiving an invalid identifier as the permission manager",
      isValidIdentifier(
        (badIdentifier) => evmcrispr.addPermission(["voting", "token-manager", "MINT_ROLE"], badIdentifier),
        false,
        false
      )
    );

    it("fails when granting a permission to the same entity twice", async () => {
      await expectThrowAsync(evmcrispr.addPermission(["voting", "token-manager", "MINT_ROLE"], "voting"), {
        type: ErrorException,
      });
    });

    it("encodes a create permission action correctly", () => {
      const expectedCreatePermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall("createPermission(address,address,bytes32,address)", [
            ...resolvePermission(NEW_PERMISSION),
            DAO[PERMISSION_MANAGER as keyof typeof DAO],
          ]),
        },
      ];
      const encodedCreatePermissionAction = evmcrispr.addPermission(NEW_PERMISSION, PERMISSION_MANAGER)();

      expect(expectedCreatePermissionAction).eql(encodedCreatePermissionAction);
    });

    it("encodes a grant permission action when permission already exists", () => {
      const expectedGrantPermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall("grantPermission(address,address,bytes32)", resolvePermission(GRANT_PERMISSION)),
        },
      ];
      const encodedGrantPermissionAction = evmcrispr.addPermission(GRANT_PERMISSION, PERMISSION_MANAGER)();

      expect(expectedGrantPermissionAction).eql(encodedGrantPermissionAction);
    });

    it("encodes a grant permission action with parameters when permission already exists", async () => {
      await resetCrispr(); // TODO: Implement beforeEach so we don't have to apply this filthy hack

      const expectedGrantPermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall("grantPermissionP(address,address,bytes32,uint256[])", [
            ...resolvePermission(GRANT_PERMISSION),
            GRANT_PERMISSION_PARAMS[3](),
          ]),
        },
      ];
      const encodedGrantPermissionAction = evmcrispr.addPermission(GRANT_PERMISSION_PARAMS, PERMISSION_MANAGER)();

      expect(expectedGrantPermissionAction).eql(encodedGrantPermissionAction);
    });

    it("encodes a create permission and grant permission with parameters in the same function", () => {
      const expectedCreatePermissionWithParamsAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall("createPermission(address,address,bytes32,address)", [
            ...resolvePermission(NEW_PERMISSION),
            DAO[PERMISSION_MANAGER as keyof typeof DAO],
          ]),
        },
        {
          to: DAO.acl,
          data: encodeActCall("grantPermissionP(address,address,bytes32,uint256[])", [
            ...resolvePermission(NEW_PERMISSION),
            NEW_PERMISSION_PARAMS[3](),
          ]),
        },
      ];
      const encodedGrantPermissionAction = evmcrispr.addPermission(NEW_PERMISSION_PARAMS, PERMISSION_MANAGER)();

      expect(expectedCreatePermissionWithParamsAction).eql(encodedGrantPermissionAction);
    });
  });

  describe("addPermissions()", () => {
    it("encodes a set of create permission actions correctly", () => {
      const expectedCreateActions = NEW_PERMISSIONS.map(
        (createPermission): Action => ({
          to: DAO.acl,
          data: encodeActCall("createPermission(address,address,bytes32,address)", [
            ...resolvePermission(createPermission),
            DAO[PERMISSION_MANAGER as keyof typeof DAO],
          ]),
        })
      );
      const createActions = evmcrispr.addPermissions(NEW_PERMISSIONS, PERMISSION_MANAGER)();

      expect(createActions).eql(expectedCreateActions);
    });
    it("encodes a set of grant permission actions correctly", () => {
      const grantPermissions: Permission[] = NEW_PERMISSIONS.map(([, app, role]) => ["kernel", app, role]);
      const expectedGrantActions = grantPermissions.map(
        (grantPermission): Action => ({
          to: DAO.acl,
          data: encodeActCall("grantPermission(address,address,bytes32)", resolvePermission(grantPermission)),
        })
      );
      const grantActions = evmcrispr.addPermissions(
        grantPermissions.map((p) => resolvePermission(p)),
        PERMISSION_MANAGER
      )();

      expect(grantActions).eql(expectedGrantActions);
    });
  });

  describe("app()", () => {
    it(
      "fails when receiving an invalid identifier",
      isValidIdentifier((badIdentifier) => evmcrispr.app(badIdentifier))
    );

    it("fails when fetching non-existent app", async () => {
      await expectThrowAsync(evmcrispr.app("non-existent.open"), {
        type: ErrorNotFound,
        name: "ErrorAppNotFound",
      });
    });
    it("returns the correct app address", () => {
      const appAddress = evmcrispr.app("voting")();

      expect(addressesEqual(DAO.voting, appAddress)).to.be.true;
    });
  });

  describe("apps()", () => {
    it("returns the list of apps", () => {
      expect(evmcrispr.apps()).to.be.eql([
        "kernel:0",
        "acl:0",
        "evm-script-registry:0",
        "vault:0",
        "finance:0",
        "token-manager:0",
        "voting:0",
        "disputable-voting.open:0",
        "tollgate.open:0",
      ]);
    });
    it("is updated when a new app is installed", async () => {
      await evmcrispr.installNewApp("agent:new", [])();
      expect(evmcrispr.apps()).to.be.length(10).and.to.include("agent:new");
    });
  });

  describe("act()", () => {
    const target = ADDRESS;
    it(
      "fails when receiving an invalid identifier as the agent",
      isValidIdentifier((badIdentifier) => evmcrispr.act(badIdentifier, target, "mint()", []), false, false)
    );

    it(
      "fails when receiving an invalid identifier as the target",
      isValidIdentifier((badIdentifier) => evmcrispr.act("agent", badIdentifier, "mint()", []), false, false)
    );

    it("fails when receiving an invalid signature", async () => {
      await expectThrowAsync(
        () => evmcrispr.act("agent", target, "mint", []),
        undefined,
        "Wrong signature format: mint"
      );
      await expectThrowAsync(
        () => evmcrispr.act("agent", target, "mint(", []),
        undefined,
        "Wrong signature format: mint("
      );
      await expectThrowAsync(
        () => evmcrispr.act("agent", target, "mint(uint,)", []),
        undefined,
        "Wrong signature format: mint(uint,)"
      );
      await expectThrowAsync(
        () => evmcrispr.act("agent", target, "mint(,uint)", []),
        undefined,
        "Wrong signature format: mint(,uint)"
      );
    });
    it("encodes an act action correctly", async () => {
      const { actTarget, actSignature, actSignatureParams, actSignatureUnresolvedParams } = APP;
      const expectedCallAction: Action = {
        to: DAO.agent,
        data: encodeActCall("forward(bytes)", [
          encodeCallScript([
            {
              to: actTarget,
              data: encodeActCall(actSignature, actSignatureParams),
            },
          ]),
        ]),
      };
      const callAction = evmcrispr.act("vault", actTarget, actSignature, actSignatureParams)(); // TODO: Change it with an agent
      expect(callAction).eql(expectedCallAction);

      const callActionUnresolved = evmcrispr.act("vault", actTarget, actSignature, actSignatureUnresolvedParams)(); // TODO: Change it with an agent
      expect(callActionUnresolved).eql(expectedCallAction);
    });
  });

  describe("call()", () => {
    it(
      "fails when receiving an invalid identifier",
      isValidIdentifier((badIdentifier) => evmcrispr.call(badIdentifier), false, false)
    );

    it("fails when calling an invalid method", async () => {
      await expectThrowAsync(evmcrispr.call("token-manager").unknownMethod(), undefined, "Unknown method");

      await expectThrowAsync(evmcrispr.call("token-manager").mint(), undefined, "Invalid method's parameters");
    });
    // TODO Check that params can be resolve (pass evmcrispr.app())
    it("encodes a call method correctly", () => {
      const { callSignature, callSignatureParams, callSignatureUnresolvedParams } = APP;
      const callMethod = callSignature.split("(")[0];
      const expectedCallAction: Action = {
        to: DAO[APP.appIdentifier],
        data: encodeActCall(callSignature, callSignatureParams),
      };
      const callAction = evmcrispr.call(APP.appIdentifier)[callMethod](...callSignatureParams)();
      expect(callAction).eql(expectedCallAction);

      const callActionUnresolved = evmcrispr.call(APP.appIdentifier)[callMethod](...callSignatureUnresolvedParams)();
      expect(callActionUnresolved).eql(expectedCallAction);
    });

    it("can enumerate non-constant function calls", () => {
      const keys = Object.getOwnPropertyNames(evmcrispr.call("token-manager"));
      expect(keys).to.be.eql([
        "assignVested",
        "mint",
        "onTransfer",
        "transferToVault",
        "burn",
        "assign",
        "issue",
        "forward",
        "onApprove",
        "initialize",
        "proxyPayment",
        "revokeVesting",
      ]);
    });
  });

  describe("installNewApp()", () => {
    it(
      "fails when receiving an invalid identifier",
      isValidIdentifier((badIdentifier) => evmcrispr.installNewApp(badIdentifier), false, false)
    );

    it("fails when doesn't find the app's repo", async () => {
      const noRepoIdentifier = "non-existent-repo.open:new-app";

      await expectThrowAsync(evmcrispr.installNewApp(noRepoIdentifier), {
        type: ErrorNotFound,
        name: "ErrorRepoNotFound",
      });
    });

    it("encodes an installation action correctly", async () => {
      const { appId, appIdentifier, codeAddress, initializeParams, initializeUnresolvedParams, initializeSignature } =
        APP;
      const expectedEncodedAction: Action = {
        to: DAO.kernel.toLowerCase(),
        data: encodeActCall("newAppInstance(bytes32,address,bytes,bool)", [
          appId,
          codeAddress,
          encodeActCall(initializeSignature, initializeParams),
          false,
        ]),
      };
      const encodedAction = await evmcrispr.installNewApp(`${appIdentifier}:new-app`, initializeParams)();

      expect(encodedAction).eql(expectedEncodedAction);

      const encodedActionUnresolved = await evmcrispr.installNewApp(
        `${appIdentifier}:new-app2`,
        initializeUnresolvedParams
      )();
      expect(encodedActionUnresolved).eql(expectedEncodedAction);
    });

    it("installed app exists", () => {
      const installedAppAddress = evmcrispr.app(`${APP.appIdentifier}:new-app`)();

      expect(utils.isAddress(installedAppAddress)).to.be.true;
    });

    it("fails when installing apps with the same label", async () => {
      await evmcrispr.installNewApp("token-manager:same-label", APP.initializeParams)();

      await expectThrowAsync(evmcrispr.installNewApp("token-manager:same-label", APP.initializeParams), {
        type: ErrorException,
      });
    });
  });

  describe("revokePermission()", () => {
    testBadPermission((badPermission) => evmcrispr.revokePermission(badPermission, true));

    it("encodes a revoke permission and remove manager action correctly", () => {
      const revokePermission = resolvePermission(REVOKE_PERMISSION);
      const expectedRevokeAction: Action = {
        to: DAO.acl.toLowerCase(),
        data: encodeActCall("revokePermission(address,address,bytes32)", revokePermission),
      };
      const expectedRemoveManagerAction: Action = {
        to: DAO.acl.toLowerCase(),
        data: encodeActCall("removePermissionManager(address,bytes32)", revokePermission.slice(1, 3)),
      };
      const actions = evmcrispr.revokePermission(REVOKE_PERMISSION, true)() as Action[];

      expect(actions).eql([expectedRevokeAction, expectedRemoveManagerAction]);
    });

    it("doesn't encode a remove manager action when told not to`", () => {
      const actions = evmcrispr.revokePermission(["voting", "voting", "MODIFY_QUORUM_ROLE"], false)() as Action[];

      expect(actions.length).eq(1);
    });

    it("fails when revoking a permission from an entity that doesn't have it", async () => {
      const [_, app, role] = REVOKE_PERMISSION;
      await expectThrowAsync(evmcrispr.revokePermission(["evm-script-registry", app, role], true), {
        type: ErrorNotFound,
        name: "ErrorPermissionNotFound",
      });
    });
  });

  describe("revokePermissions()", () => {
    it("encodes a set of revoke permissions and permission manager actions correctly", () => {
      const expectedRevokeActions = REVOKE_PERMISSIONS.reduce((revokingActions: Action[], permission) => {
        const resolvedPermission = resolvePermission(permission);
        return [
          ...revokingActions,
          { to: DAO.acl, data: encodeActCall("revokePermission(address,address,bytes32)", resolvedPermission) },
          {
            to: DAO.acl,
            data: encodeActCall("removePermissionManager(address,bytes32)", resolvedPermission.slice(1, 3)),
          },
        ];
      }, []);
      const revokeActions = evmcrispr.revokePermissions(REVOKE_PERMISSIONS, true)();

      expect(revokeActions).eql(expectedRevokeActions);
    });
  });

  describe("setOracle()", () => {
    it("encodes an ACL oracle parameter from an address", () => {
      const oracle = evmcrispr.setOracle(ADDRESS)();
      const expectedOracle = [`0xcb0100000000000000000000${ADDRESS.slice(2)}`];
      expect(expectedOracle).eql(oracle);
    });

    it("encodes an ACL oracle parameter from an app identifier", () => {
      const oracle = evmcrispr.setOracle("voting")();
      const app = evmcrispr.app("voting")();
      const expectedOracle = [`0xcb0100000000000000000000${app.slice(2)}`];
      expect(expectedOracle).eql(oracle);
    });
  });
});
