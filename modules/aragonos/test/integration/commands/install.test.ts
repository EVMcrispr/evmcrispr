import "../../setup";

import type AragonOS from "@evmcrispr/module-aragonos";
import { type Action, BindingsSpace, CommandError } from "@evmcrispr/sdk";
import { encodeFunctionData, isAddress, parseAbiItem } from "viem";

const encodeActCall = (signature: string, params: any[] = []): string =>
  encodeFunctionData({
    abi: [parseAbiItem(`function ${signature}`)],
    functionName: signature.split("(")[0],
    args: params,
  });

import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { DAO } from "../../fixtures";
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
const preamble = `load aragonos [install @app]\naragonos:connect ${DAO.kernel} (`;

describeCommand("install", {
  describeName: "AragonOS > commands > install <$var> <repo> [initParams]",
  module: "aragonos",
  preamble,
  docCases: [
    {
      description: "Install a token-manager app",
      code: "aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  aragonos:install $tm token-manager @aragonos:app(agent) false 1000e18\n)",
    },
  ],
  cases: [
    {
      name: "should return a correct install action",
      script: `install $app ${appIdentifier} ${initializeUnresolvedParams.join(" ")}\n)`,
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
        const installedAddress = aragonos.bindingsManager.getBindingValue(
          "$app",
          BindingsSpace.USER,
        );

        expect(installedAddress, "install variable not bound").to.exist;
        expect(isAddress(installedAddress as string)).to.be.true;
        expect(installationActions, "installation actions mismatch").to.eql(
          expectedInstallationActions,
        );
      },
    },
    {
      name: "should return a correct install action given a specific version",
      script: `install $app ${appIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )} --version 1.0.1\n)`,
      validate: async (installationActions, _interpreter) => {
        const specificVersion = "0x714c925ede405687752c4ad32078137c4f179538";

        const expectedInstallationActions = [
          createTestAction("newAppInstance", DAO.kernel, [
            appId,
            specificVersion,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        ];

        expect(installationActions, "installation actions mismatch").to.eql(
          expectedInstallationActions,
        );
      },
    },
    {
      name: "should install a second instance of an already installed app",
      script: `install $app1 ${appIdentifier} ${initializeUnresolvedParams.join(" ")}\ninstall $app2 ${appIdentifier} ${initializeUnresolvedParams.join(" ")}\nset $resolved1 @app(${appIdentifier})\nset $resolved2 @app(${appIdentifier} 1)\n)`,
      validate: async (installationActions, interpreter) => {
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const binding = (name: string) =>
          aragonos.bindingsManager.getBindingValue(name, BindingsSpace.USER);

        expect(installationActions).to.have.lengthOf(2);
        expect(binding("$app1"), "first install variable mismatch").to.equal(
          binding("$resolved1"),
        );
        expect(binding("$app2"), "second install variable mismatch").to.equal(
          binding("$resolved2"),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail passing an invalid repo identifier",
      script: `install $app Invalid-Repo ${initializeUnresolvedParams.join(" ")}\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "install")!;
        return new CommandError(
          c,
          `<identifier> must be a valid repo identifier, got Invalid-Repo`,
        );
      },
    },
    {
      name: "should fail when passing a repo that can not be resolved",
      script: `install $app non-existent-repo ${initializeUnresolvedParams.join(" ")}\n)`,
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
      script: `install $app ${appIdentifier} ${initializeUnresolvedParams.join(
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
      name: "should fail when passing invalid initialize params",
      script: `install $app ${appIdentifier} 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a 1e18 false\n)`,
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
  errorCases: [
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos\naragonos:install $app ${appIdentifier} 0x0000000000000000000000000000000000000001 false 1000e18`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
