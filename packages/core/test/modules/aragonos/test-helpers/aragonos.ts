import { it } from "bun:test";
import type AragonOS from "@evmcrispr/module-aragonos";
import {
  getAragonEnsResolver,
  resolveName,
} from "@evmcrispr/module-aragonos/utils";
import {
  type Address,
  type AST,
  type BlockExpressionNode,
  CommandError,
  type CommandExpressionNode,
  listItems,
  NodeType,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type { TestInterpreter } from "../../../test-helpers/evml";
import {
  createInterpreter,
  itChecksNonDefinedIdentifier,
} from "../../../test-helpers/evml";
import { expectThrowAsync } from "../../../test-helpers/expects";

export const _aragonEns = async (
  ensName: string,
  module: AragonOS,
): Promise<Address | null> => {
  const ensResolver = module.getConfigBinding("ensResolver");

  const name = await resolveName(
    ensName,
    await module.getClient(),
    ensResolver || getAragonEnsResolver(await module.getChainId()),
  );

  return name;
};

export const createAragonScriptInterpreter =
  (client: PublicClient, daoAddress: Address) =>
  (commands: string[] = []): TestInterpreter => {
    return createInterpreter(
      `
  load aragonos --as ar
  ar:connect ${daoAddress} (
    ${commands.join("\n")}
  )
`,
      client,
    );
  };

export const findAragonOSCommandNode = (
  ast: AST,
  commandName: string,
  nestingLevel = 0,
  index = 0,
): CommandExpressionNode | undefined => {
  let connectNode = ast.body.find(
    (n) =>
      n.type === NodeType.CommandExpression &&
      (n as CommandExpressionNode).name === "connect",
  ) as CommandExpressionNode;

  if (nestingLevel) {
    let i = 0;
    while (i < nestingLevel) {
      const blockNode = connectNode.args.find(
        (arg) => arg.type === NodeType.BlockExpression,
      ) as BlockExpressionNode;

      connectNode = blockNode.body.find((c) => c.name === "connect")!;
      i++;
    }
  }

  if (commandName === "connect") {
    return connectNode;
  }

  const blockNode = connectNode.args.find(
    (n) => n.type === NodeType.BlockExpression,
  ) as BlockExpressionNode;
  const commandNodes = blockNode.body.filter((c) => c.name === commandName);

  return commandNodes[index];
};

export const itChecksBadPermission = (
  commandName: string,
  createPermissionActionInterpreter: (
    badPermission: [string, string, string, string?],
  ) => TestInterpreter,
  checkPermissionManager = false,
): void => {
  const permissionErrorText = "invalid permission provided";
  const permission = ["kernel", "acl", "CREATE_PERMISSIONS_ROLE"];

  itChecksNonDefinedIdentifier(
    "should fail when receiving a non-defined grantee identifier",
    (nonDefinedIdentifier) =>
      createPermissionActionInterpreter([
        nonDefinedIdentifier,
        permission[1],
        permission[2],
      ]),
    commandName,
    0,
    true,
  );

  itChecksNonDefinedIdentifier(
    "should fail when receiving a non-defined app identifier",
    (nonDefinedIdentifier) =>
      createPermissionActionInterpreter([
        permission[0],
        nonDefinedIdentifier,
        permission[2],
      ]),
    commandName,
    1,
    true,
  );

  it("should fail when receiving an invalid grantee address", async () => {
    const invalidGrantee = "false";
    const interpreter = createPermissionActionInterpreter([
      invalidGrantee,
      permission[1],
      permission[2],
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, commandName);
    const error = new CommandError(
      c!,
      listItems(permissionErrorText, [
        `<grantee> must be a valid address, got ${invalidGrantee}`,
      ]),
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid app address", async () => {
    const invalidApp = "false";
    const interpreter = createPermissionActionInterpreter([
      permission[0],
      invalidApp,
      permission[2],
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, commandName);
    const error = new CommandError(
      c!,
      listItems(permissionErrorText, [
        `<app> must be a valid address, got ${invalidApp}`,
      ]),
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving a non-existent role", async () => {
    const nonExistentRole = "NON_EXISTENT_ROLE";
    const interpreter = createPermissionActionInterpreter([
      permission[0],
      permission[1],
      nonExistentRole,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, commandName);
    const error = new CommandError(
      c!,
      `given permission doesn't exists on app ${permission[1]}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid hash role", async () => {
    const invalidHashRole =
      "0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366";
    const interpreter = createPermissionActionInterpreter([
      permission[0],
      permission[1],
      invalidHashRole,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, commandName)!;
    const error = new CommandError(
      c,
      listItems(permissionErrorText, [
        `<role> must be a valid hash, got ${invalidHashRole}`,
      ]),
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  if (checkPermissionManager) {
    it("should fail when not receiving permission manager", async () => {
      const interpreter = createPermissionActionInterpreter([
        permission[0],
        permission[1],
        permission[2],
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, commandName)!;
      const error = new CommandError(c, "required permission manager missing");

      await expectThrowAsync(() => interpreter.interpret(), error);
    });

    itChecksNonDefinedIdentifier(
      "should fail when receiving a non-existent permission manager identifier",
      (nonDefinedIdentifier) =>
        createPermissionActionInterpreter([
          permission[0],
          permission[1],
          permission[2],
          nonDefinedIdentifier,
        ]),
      commandName,
      3,
      true,
    );

    it("should fail when receiving an invalid permission manager address", async () => {
      const invalidManager = "false";
      const interpreter = createPermissionActionInterpreter([
        permission[0],
        permission[1],
        permission[2],
        invalidManager,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, commandName)!;
      const error = new CommandError(
        c,
        `[permissionManager] must be a valid address, got ${invalidManager}`,
      );

      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  }
};
