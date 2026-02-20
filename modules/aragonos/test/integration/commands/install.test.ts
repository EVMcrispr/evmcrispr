import "../../setup";

import type AragonOS from "@evmcrispr/module-aragonos";
import { type Action, CommandError } from "@evmcrispr/sdk";
import { encodeFunctionData, isAddressEqual, parseAbiItem } from "viem";

const encodeActCall = (signature: string, params: any[] = []): string =>
  encodeFunctionData({
    abi: [parseAbiItem(`function ${signature}`)],
    functionName: signature.split("(")[0],
    args: params,
  });

import { describeCommand, expect } from "@evmcrispr/test-utils";
import { DAO, DAO2 } from "../../fixtures";
import { APP } from "../../fixtures/mock-app";
import { createTestAction } from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const {
  appId,
  appIdentifier,
  codeAddress,
  initializeParams,
  initializeUnresolvedParams,
  initializeSignature,
} = APP;
const newAppIdentifier = `${appIdentifier}:new-app`;
const preamble = `load aragonos --as ar\nar:connect ${DAO.kernel} (`;

describeCommand("install", {
  describeName: "AragonOS > commands > install <$var> <repo> [initParams]",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct install action",
      script: `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}\n)`,
      validate: async (installationActions, interpreter) => {
        const expectedInstallationActions: Action[] = [
          createTestAction("newAppInstance", DAO.kernel, [
            appId,
            codeAddress,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        ];
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.connectedDAOs[0];
        const installedApp = dao.resolveApp(newAppIdentifier);

        expect(installedApp, "DAO does not have installed app").to.exist;
        expect(
          isAddressEqual(installedApp!.codeAddress, codeAddress),
          "wrong installed app version",
        ).to.be.true;
        expect(installationActions, "installation actions mismatch").to.eql(
          expectedInstallationActions,
        );
      },
    },
    {
      name: "should return a correct install action given a specific version",
      script: `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )} --version 1.0.1\n)`,
      validate: async (installationActions, interpreter) => {
        const specificVersion = "0x714c925ede405687752c4ad32078137c4f179538";
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel)!;
        const installedApp = dao.resolveApp(newAppIdentifier);

        const expectedInstallationActions = [
          createTestAction("newAppInstance", DAO.kernel, [
            appId,
            specificVersion,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        ];

        expect(installedApp, " DAO does not have installed app").to.exist;
        expect(
          isAddressEqual(installedApp!.codeAddress, specificVersion),
          "wrong installed app version",
        ).to.be.true;
        expect(installationActions, "installation actions mismatch").to.eql(
          expectedInstallationActions,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail passing an invalid repo identifier",
      script: `install $app missing-label-repo ${initializeUnresolvedParams.join(" ")}\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "install")!;
        return new CommandError(
          c,
          `invalid labeled identifier missing-label-repo`,
        );
      },
    },
    {
      name: "should fail when passing a repo that can not be resolved",
      script: `install $app non-existent-repo:new-app ${initializeUnresolvedParams.join(" ")}\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "install")!;
        return new CommandError(
          c,
          `ENS repo name non-existent-repo.aragonpm.eth couldn't be resolved`,
        );
      },
    },
    {
      name: "should fail when passing an invalid --version option",
      script: `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )} --version 1e18\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "install")!;
        return new CommandError(
          c,
          `invalid --version option. Expected a semantic version, but got 1000000000000000000`,
        );
      },
    },
    {
      name: "should fail when installing an app with an identifier previously used",
      script: `install $app1 ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}\ninstall $app2 ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "install", 0, 1)!;
        return new CommandError(
          c,
          `identifier ${newAppIdentifier} is already in use.`,
        );
      },
    },
    {
      name: "should fail when passing invalid initialize params",
      script: `install $app ${newAppIdentifier} 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a 1e18 false\n)`,
      error: (interpreter) => {
        const paramsErrors = [
          '-param _token of type address: Address "0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a" is invalid.\n\n- Address must be a hex value of 20 bytes. Got 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a',
          '-param _transferable of type bool: Invalid boolean value: "1000000000000000000". Got 1000000000000000000',
          "-param _maxAccountTokens of type uint256: Invalid BigInt value. Got false",
        ];
        const c = findAragonOSCommandNode(interpreter.ast, "install")!;
        return new CommandError(
          c,
          `error when encoding initialize call:\n${paramsErrors.join("\n")}`,
        );
      },
    },
  ],
});

describeCommand("install", {
  describeName: "AragonOS > commands > install > special cases",
  module: "aragonos",
  cases: [
    {
      name: "should return a correct install action given a different DAO",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")} --dao ${DAO.kernel}\n  )\n)`,
      validate: async (installActions) => {
        const expectedInstallActions = [
          createTestAction("newAppInstance", DAO.kernel, [
            appId,
            codeAddress,
            encodeActCall(initializeSignature, [
              DAO2.agent,
              ...initializeParams.slice(1, initializeParams.length),
            ]),
            false,
          ]),
        ];
        expect(installActions).to.eql(expectedInstallActions);
      },
    },
  ],
  errorCases: [
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos --as ar\nar:install $app ${newAppIdentifier} 0x0000000000000000000000000000000000000001 false 1000e18`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
