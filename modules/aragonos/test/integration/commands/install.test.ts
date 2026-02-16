import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import type AragonOS from "@evmcrispr/module-aragonos";
import { type Action, addressesEqual, CommandError } from "@evmcrispr/sdk";
import { encodeFunctionData, type PublicClient, parseAbiItem } from "viem";

const encodeActCall = (signature: string, params: any[] = []): string =>
  encodeFunctionData({
    abi: [parseAbiItem(`function ${signature}`)],
    functionName: signature.split("(")[0],
    args: params,
  });

import {
  expect,
  expectThrowAsync,
  getPublicClient,
} from "@evmcrispr/test-utils";
import { DAO, DAO2 } from "../../fixtures";
import { APP } from "../../fixtures/mock-app";
import { createTestAction } from "../../test-helpers/actions";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";
import { createInterpreter } from "../../test-helpers/evml";

describe("AragonOS > commands > install <$var> <repo> [initParams]", () => {
  const {
    appId,
    appIdentifier,
    codeAddress,
    initializeParams,
    initializeUnresolvedParams,
    initializeSignature,
  } = APP;
  const newAppIdentifier = `${appIdentifier}:new-app`;

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

  it("should return a correct install action", async () => {
    const interpreter = createAragonScriptInterpreter([
      `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}`,
    ]);

    const installationActions = await interpreter.interpret();

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
      addressesEqual(installedApp!.codeAddress, codeAddress),
      "wrong installed app version",
    ).to.be.true;
    expect(installationActions, "installation actions mismatch").to.eql(
      expectedInstallationActions,
    );
  });

  it("should return a correct install action given a specific version", async () => {
    const specificVersion = "0x714c925ede405687752c4ad32078137c4f179538";
    const interpreter = createAragonScriptInterpreter([
      `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )} --version 1.0.1`,
    ]);

    const installationActions = await interpreter.interpret();

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
      addressesEqual(installedApp!.codeAddress, specificVersion),
      "wrong installed app version",
    ).to.be.true;
    expect(installationActions, "installation actions mismatch").to.eql(
      expectedInstallationActions,
    );
  });

  it("should return a correct install action given a different DAO", async () => {
    const interpreter = createInterpreter(
      `
        load aragonos --as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(
              " ",
            )} --dao ${DAO.kernel}
          )
        )
      `,
      client,
    );

    const installActions = await interpreter.interpret();

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
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos --as ar

    ar:install $app ${newAppIdentifier} 0x0000000000000000000000000000000000000001 false 1000e18
  `,
      client,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      `must be used within a "connect" command`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail passing an invalid repo identifier", async () => {
    const invalidRepoIdentifier = `missing-label-repo`;
    const interpreter = createAragonScriptInterpreter([
      `install $app ${invalidRepoIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "install")!;
    const error = new CommandError(
      c,
      `invalid labeled identifier ${invalidRepoIdentifier}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing a repo that can not be resolved", async () => {
    const invalidRepoENSName = `non-existent-repo:new-app`;
    const interpreter = createAragonScriptInterpreter([
      `install $app ${invalidRepoENSName} ${initializeUnresolvedParams.join(" ")}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "install")!;
    const error = new CommandError(
      c,
      `ENS repo name ${`${
        invalidRepoENSName.split(":")[0]
      }.aragonpm.eth`} couldn't be resolved`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid --version option", async () => {
    const invalidVersion = "1e18";
    const interpreter = createAragonScriptInterpreter([
      `install $app ${newAppIdentifier} ${initializeUnresolvedParams.join(
        " ",
      )} --version ${invalidVersion}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "install")!;
    const error = new CommandError(
      c,
      `invalid --version option. Expected a semantic version, but got 1000000000000000000`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when installing an app with an identifier previously used", async () => {
    const interpreter = createAragonScriptInterpreter([
      `install $app1 ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}`,
      `install $app2 ${newAppIdentifier} ${initializeUnresolvedParams.join(" ")}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "install", 0, 1)!;
    const error = new CommandError(
      c,
      `identifier ${newAppIdentifier} is already in use.`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing invalid initialize params", async () => {
    const paramsErrors = [
      '-param _token of type address: Address "0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a" is invalid.\n\n- Address must be a hex value of 20 bytes. Got 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a',
      '-param _transferable of type bool: Invalid boolean value: "1000000000000000000". Got 1000000000000000000',
      "-param _maxAccountTokens of type uint256: Invalid BigInt value. Got false",
    ];
    const interpreter = createAragonScriptInterpreter([
      `install $app ${newAppIdentifier} 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a 1e18 false`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "install")!;

    const error = new CommandError(
      c,
      `error when encoding initialize call:\n${paramsErrors.join("\n")}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
