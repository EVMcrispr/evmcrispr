import type {
  CommandExpressionNode,
  CompletionItem,
  ICommand,
  LazyBindings,
  ModuleBinding,
  NoNullableBinding,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  calculateCurrentArgIndex,
  getDeepestNodeWithArgs,
  hasCommandsBlock,
  IPFSResolver,
  NodeType,
  resolveCommand,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { isAddress } from "viem";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";

const { ALIAS, MODULE, USER } = BindingsSpace;

type EagerExecParams = [
  BindingsManager,
  { ipfsResolver: IPFSResolver; client: PublicClient },
  Position,
];

// ---------------------------------------------------------------------------
// Eager execution pipeline
// ---------------------------------------------------------------------------

const runLoadCommands = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  // Seed the eager bindings manager with the std module binding from the cache
  const moduleCache = eagerFnParams[0];
  const stdData = moduleCache.getBindingValue("std", MODULE);
  if (stdData) {
    eagerBindingsManager.setBinding("std", stdData, MODULE);
  }

  const loadCommandNodes = commandNodes.filter((c) =>
    ["load", "std:load"].includes(c.name),
  );

  await runEagerExecutions(
    loadCommandNodes,
    eagerBindingsManager,
    ...eagerFnParams,
  );
};

export const runEagerExecutions = async (
  commandNodes: CommandExpressionNode[],
  eagerBindingsManager: BindingsManager,
  ...eagerFnParams: EagerExecParams
): Promise<void> => {
  let parentCommandModule = "std";

  const commandToModule = commandNodes.reduce<string[]>(
    (commandToModule, c) => {
      if (hasCommandsBlock(c)) {
        parentCommandModule = c.module ?? parentCommandModule;
      }
      commandToModule.push(c.module ?? parentCommandModule);
      return commandToModule;
    },
    [],
  );

  const executedCommands = new Set<string>();

  const commandEagerExecutionFns = await Promise.all(
    [...commandNodes].reverse().map(async (c, index) => {
      const commandModule = commandToModule[commandToModule.length - 1 - index];
      const commandFullName = `${commandModule}:${c.name}`;

      const command = await resolveCommandNode(
        c,
        eagerBindingsManager,
        commandModule,
      );

      if (!command) {
        return;
      }

      const isClosestCommandToCaret = !executedCommands.has(commandFullName);

      try {
        const eagerFn = await command.runEagerExecution(
          c,
          ...eagerFnParams,
          isClosestCommandToCaret,
        );
        executedCommands.add(commandFullName);

        return eagerFn;
      } catch (_err) {
        return;
      }
    }),
  );

  const lazyBindingResolvers = commandEagerExecutionFns.filter<LazyBindings>(
    (b): b is LazyBindings => !!b,
  );

  lazyBindingResolvers.reverse().forEach((resolveLazyBinding) => {
    try {
      resolveLazyBinding(eagerBindingsManager);
    } catch (_err) {
      // silently ignore resolution errors
    }
  });
};

const resolveCommandNode = async (
  c: CommandExpressionNode,
  eagerBindingsManager: BindingsManager,
  parentModule: string,
): Promise<ICommand | undefined> => {
  const moduleName = c.module ?? parentModule ?? "std";

  const resolvedModuleName =
    eagerBindingsManager.getBindingValue(moduleName, ALIAS) ?? moduleName;

  const module = eagerBindingsManager.getBindingValue(
    resolvedModuleName,
    MODULE,
  );

  if (!module) {
    return;
  }

  const commandOrLoader = module.commands[c.name];
  if (!commandOrLoader) return;
  return resolveCommand(commandOrLoader);
};

// ---------------------------------------------------------------------------
// Completion item builders
// ---------------------------------------------------------------------------

const buildModuleCompletionItems = (
  eagerBindingsManager: BindingsManager,
): { commandItems: CompletionItem[]; helperItems: CompletionItem[] } => {
  const scopeModule = eagerBindingsManager.getScopeModule() ?? "std";

  const moduleBindings = eagerBindingsManager.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const moduleAliases = moduleBindings
    .filter((b) => !!b.value)
    .map(
      ({ identifier }) =>
        eagerBindingsManager.getBindingValue(identifier, ALIAS) ?? identifier,
    );

  return {
    commandItems: moduleBindings.flatMap(({ value: module }, index) => {
      const moduleAlias = moduleAliases[index];
      return Object.keys(module.commands)
        .map(
          (commandName) =>
            `${
              scopeModule === moduleAlias ? "" : `${moduleAlias}:`
            }${commandName}`,
        )
        .map(
          (name): CompletionItem => ({
            label: name,
            insertText: name,
            kind: "command",
          }),
        );
    }),

    helperItems: moduleBindings.flatMap(({ value: module }) => {
      return Object.keys(module.helpers)
        .map((helperName) => `@${helperName}`)
        .map(
          (name): CompletionItem => ({
            label: name,
            insertText: `${name}()`,
            kind: "helper",
            sortPriority: 3,
          }),
        );
    }),
  };
};

const buildVarCompletionItems = (
  eagerBindingsManager: BindingsManager,
  currentPos: Position,
  currentCommandNode?: CommandExpressionNode,
): CompletionItem[] => {
  let varNames = eagerBindingsManager.getAllBindingIdentifiers({
    spaceFilters: [USER],
  });

  if (currentCommandNode && currentCommandNode.name === "set") {
    const currentArgIndex = calculateCurrentArgIndex(
      currentCommandNode,
      currentPos,
    );
    if (currentArgIndex === 0) {
      return [];
    } else if (currentArgIndex === 1) {
      const currentVarName = currentCommandNode.args[0].value;
      varNames = varNames.filter(
        (varName: string) => varName !== currentVarName,
      );
    }
  }

  return varNames.map(
    (name: string): CompletionItem => ({
      label: name,
      insertText: name,
      kind: "variable",
      sortPriority: 2,
    }),
  );
};

const buildCurrentArgCompletionItems = async (
  eagerBindingsManager: BindingsManager,
  currentCommandNode: CommandExpressionNode,
  parentModule: string,
  currentPos: Position,
): Promise<CompletionItem[]> => {
  const command = await resolveCommandNode(
    currentCommandNode,
    eagerBindingsManager,
    parentModule,
  );

  if (!command) {
    return [];
  }

  return command
    .buildCompletionItemsForArg(
      calculateCurrentArgIndex(currentCommandNode, currentPos),
      currentCommandNode.args,
      eagerBindingsManager,
      currentPos,
    )
    .map(
      (identifier: string): CompletionItem => ({
        label: isAddress(identifier)
          ? `${identifier.slice(0, 6)}..${identifier.slice(-4)}`
          : identifier,
        insertText: identifier,
        kind: "field",
        sortPriority: 1,
      }),
    );
};

const calculateCommandNameLength = (c: CommandExpressionNode) => {
  const offset = c.loc?.start.col ?? 0;
  const moduleNameLength = (c.module ?? "").length;
  const colonLength = c.module ? 1 : 0;
  return offset + moduleNameLength + colonLength + c.name.length;
};

const removePossibleFollowingBlock = (
  currentLine: string,
  currPos: Position,
): string => {
  const matchIndexes = ["(", ")"]
    .map((char) => currentLine.indexOf(char))
    .filter((n) => n > -1 && n >= currPos.col);

  if (!matchIndexes.length) {
    return currentLine;
  }

  const endMark = Math.min(...matchIndexes);
  return currentLine.slice(0, endMark);
};

// ---------------------------------------------------------------------------
// Main completion function
// ---------------------------------------------------------------------------

export async function getCompletions(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
  client?: PublicClient,
): Promise<CompletionItem[]> {
  const ipfsResolver = new IPFSResolver();
  const fetchers = { ipfsResolver, client: client as PublicClient };

  let fullAST: EvmlAST;
  try {
    const result = parseScript(script);
    fullAST = result.ast;
  } catch (_err) {
    return [];
  }

  const scriptLines = script.split("\n");
  const currentLineContent = scriptLines[position.line - 1] ?? "";

  // Parse just the current line for partial/incomplete command support
  let currentLineAST: EvmlAST;
  try {
    const result = parseScript(
      [
        ...Array(position.line - 1).map(() => ""),
        removePossibleFollowingBlock(currentLineContent, position),
      ].join("\n"),
    );
    currentLineAST = result.ast;
  } catch (_err) {
    return [];
  }

  const currentCommandNode = currentLineAST.getCommandAtLine(position.line);

  const deepestResult = currentCommandNode
    ? getDeepestNodeWithArgs(currentCommandNode, position)
    : { arg: undefined };

  // Suppress completions inside string literals
  if (
    currentCommandNode &&
    deepestResult.arg &&
    deepestResult.arg.type === NodeType.StringLiteral
  ) {
    return [];
  }

  let contextModuleName = "std";

  const commandNodes: CommandExpressionNode[] = fullAST
    .getCommandsUntilLine(position.line - 1, ["load", "set"])
    .filter((c: any) => {
      const itHasCommandsBlock = hasCommandsBlock(c);
      const loc = c.loc;
      const currentLine = position.line;
      if (
        !itHasCommandsBlock ||
        (itHasCommandsBlock &&
          loc &&
          currentLine >= loc.start.line &&
          currentLine <= loc.end.line)
      ) {
        if (itHasCommandsBlock) {
          contextModuleName = c.module ?? contextModuleName;
        }
        return true;
      }
      return false;
    });

  const eagerBindingsManager = new BindingsManager();

  // 1. Load modules
  await runLoadCommands(
    commandNodes,
    eagerBindingsManager,
    moduleCache,
    fetchers,
    position,
  );

  // 2. Resolve variables
  await runEagerExecutions(
    commandNodes.filter((c) => ["set", "std:set"].includes(c.name)),
    eagerBindingsManager,
    moduleCache,
    fetchers,
    position,
  );

  // 3. Execute other commands
  const filteredCommandNodes = commandNodes.filter(
    (c) => !["load", "std:load", "set", "std:set"].includes(c.name),
  );

  await runEagerExecutions(
    currentCommandNode
      ? [...filteredCommandNodes, currentCommandNode]
      : filteredCommandNodes,
    eagerBindingsManager,
    moduleCache,
    fetchers,
    position,
  );

  // 4. Build completion items
  const { commandItems, helperItems } =
    buildModuleCompletionItems(eagerBindingsManager);
  const emptyLine = !currentLineContent.trim().length;

  const displayCommandSuggestions =
    emptyLine ||
    (!!currentCommandNode?.loc &&
      position.col >= 0 &&
      position.col <= calculateCommandNameLength(currentCommandNode));

  if (displayCommandSuggestions) {
    return commandItems;
  }

  const variableItems = buildVarCompletionItems(
    eagerBindingsManager,
    position,
    currentCommandNode,
  );

  let currentArgItems: CompletionItem[];

  if (currentCommandNode) {
    currentArgItems = await buildCurrentArgCompletionItems(
      eagerBindingsManager,
      currentCommandNode,
      contextModuleName,
      position,
    );
  } else {
    currentArgItems = eagerBindingsManager
      .getAllBindingIdentifiers({
        spaceFilters: [BindingsSpace.ADDR],
      })
      .map(
        (identifier: string): CompletionItem => ({
          insertText: identifier,
          label: identifier,
          kind: "field",
          sortPriority: 1,
        }),
      );
  }

  return [...currentArgItems, ...helperItems, ...variableItems];
}

// ---------------------------------------------------------------------------
// Keywords extraction
// ---------------------------------------------------------------------------

export async function getKeywords(
  script: string,
  moduleCache: BindingsManager,
): Promise<{ commands: string[]; helpers: string[] }> {
  let ast: EvmlAST;
  try {
    const result = parseScript(script);
    ast = result.ast;
  } catch (_err) {
    return { commands: [], helpers: [] };
  }

  const scriptLines = script.split("\n");
  const commandNodes = ast.getCommandsUntilLine(scriptLines.length, [
    "load",
    "set",
  ]);
  const loadNodes = commandNodes.filter(
    (c: CommandExpressionNode) => c.name === "load",
  );

  if (loadNodes.length) {
    await runEagerExecutions(
      loadNodes,
      moduleCache,
      moduleCache,
      {} as any,
      {} as any,
    );
  }

  // Extract default std keywords from the module cache
  const stdModuleData = moduleCache.getBindingValue("std", MODULE);
  const commands: string[] = stdModuleData
    ? Object.keys(stdModuleData.commands).flatMap((name) => [
        name,
        `std:${name}`,
      ])
    : [];
  const helpers: string[] = stdModuleData
    ? Object.keys(stdModuleData.helpers).map((name) => `@${name}`)
    : [];

  // Extract keywords from loaded modules
  const moduleBindings = moduleCache.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  for (const { identifier: moduleName, value: moduleData } of moduleBindings) {
    if (moduleName === "std") continue;
    const moduleAlias =
      moduleCache.getBindingValue(moduleName, ALIAS) ?? moduleName;
    const commandNames = Object.keys(moduleData.commands).flatMap((name) => [
      name,
      `${moduleAlias}:${name}`,
    ]);
    const helperNames = Object.keys(moduleData.helpers).map(
      (name) => `@${name}`,
    );
    commands.push(...commandNames);
    helpers.push(...helperNames);
  }

  return { commands, helpers };
}
