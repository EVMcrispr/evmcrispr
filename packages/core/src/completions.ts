import type {
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionContext,
  CompletionItem,
  ICommand,
  ModuleBinding,
  NoNullableBinding,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  calculateCurrentArgIndex,
  completionsForType,
  getDeepestNodeWithArgs,
  hasCommandsBlock,
  isBuiltinType,
  NodeType,
  resolveCommand,
  variableItem,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";

const { MODULE, USER } = BindingsSpace;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveCommandNode = async (
  c: CommandExpressionNode,
  bindings: BindingsManager,
  parentModule: string,
): Promise<ICommand | undefined> => {
  const moduleName = c.module ?? parentModule ?? "std";
  const moduleData = bindings.getBindingValue(moduleName, MODULE);
  if (!moduleData) return;

  const commandOrLoader = moduleData.commands[c.name];
  if (!commandOrLoader) return;
  return resolveCommand(commandOrLoader);
};

/** Find all custom types across loaded modules. */
const collectCustomTypes = (bindings: BindingsManager) => {
  const moduleBindings = bindings.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const merged: Record<string, any> = {};
  for (const { value: mod } of moduleBindings) {
    if (mod.types) {
      Object.assign(merged, mod.types);
    }
  }
  return merged;
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
// Completion item builders
// ---------------------------------------------------------------------------

const buildModuleCompletionItems = (
  bindings: BindingsManager,
): { commandItems: CompletionItem[]; helperItems: CompletionItem[] } => {
  const scopeModule = bindings.getScopeModule() ?? "std";

  const moduleBindings = bindings.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const seen = new Set<object>();
  const dedupedBindings = moduleBindings.filter((b) => {
    if (!b.value || seen.has(b.value)) return false;
    seen.add(b.value);
    return true;
  });

  const moduleAliases = dedupedBindings.map(
    ({ identifier, value }) => (value as any).alias ?? identifier,
  );

  return {
    commandItems: dedupedBindings.flatMap(({ value: mod }, index) => {
      const moduleAlias = moduleAliases[index];
      return Object.keys(mod.commands)
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

    helperItems: dedupedBindings.flatMap(({ value: mod }) => {
      return Object.keys(mod.helpers).map((helperName): CompletionItem => {
        const hasArgs = mod.helperHasArgs?.[helperName] ?? false;
        return {
          label: `@${helperName}`,
          insertText: hasArgs ? `@${helperName}($0)` : `@${helperName} `,
          kind: "helper",
          sortPriority: 3,
          returnType: mod.helperReturnTypes?.[helperName],
          isSnippet: hasArgs,
        };
      });
    }),
  };
};

const buildOptCompletionItems = (
  command: ICommand,
  currentCommandNode: CommandExpressionNode,
): CompletionItem[] => {
  const usedOpts = new Set(currentCommandNode.opts.map((o) => o.name));
  return command.optDefs
    .filter((o) => !usedOpts.has(o.name))
    .map(
      (o): CompletionItem => ({
        label: `--${o.name}`,
        insertText: `--${o.name} `,
        kind: "field",
        sortPriority: 4,
      }),
    );
};

const buildVarCompletionItems = (
  bindings: BindingsManager,
  currentCommandNode?: CommandExpressionNode,
  currentPos?: Position,
): CompletionItem[] => {
  let varNames = bindings.getAllBindingIdentifiers({
    spaceFilters: [USER],
  });

  if (currentCommandNode && currentPos && currentCommandNode.name === "set") {
    const currentArgIndex = calculateCurrentArgIndex(
      currentCommandNode,
      currentPos,
    );
    if (currentArgIndex === 0) {
      return [];
    }
    if (currentArgIndex === 1) {
      const currentVarName = currentCommandNode.args[0]?.value;
      varNames = varNames.filter(
        (varName: string) => varName !== currentVarName,
      );
    }
  }

  return varNames.map((name: string) => variableItem(name));
};

// ---------------------------------------------------------------------------
// Type-compatibility check for filtering helpers / variables
// ---------------------------------------------------------------------------

/** Check if a helper with the given return type can produce a value compatible
 *  with the expected argument type. */
function isReturnTypeCompatible(
  returnType: string | undefined,
  expectedType: string,
): boolean {
  if (expectedType === "any" || expectedType === "string") return true;
  if (expectedType === "variable" || expectedType === "block") return false;
  const rt = returnType ?? "string";
  if (rt === "any") return true;
  return rt === expectedType;
}

// ---------------------------------------------------------------------------
// Walk phase: resolve bindings for commands before cursor
// ---------------------------------------------------------------------------

/** Seed the bindings manager with std module data and metadata from the cache.
 *  Safe to call multiple times -- skips if std is already present. */
function seedBindings(bindings: BindingsManager, cache: BindingsManager): void {
  if (!bindings.hasBinding("std", MODULE)) {
    const stdData = cache.getBindingValue("std", MODULE);
    if (stdData) {
      bindings.setBinding("std", stdData, MODULE);
    }
  }

  const availableModulesJSON = cache.getMetadata("__available_modules__");
  if (availableModulesJSON) {
    bindings.setMetadata("__available_modules__", availableModulesJSON);
  }
}

/** Walk a list of fully-typed command nodes and resolve any bindings they
 *  produce (variable → USER, custom type with resolve → arbitrary bindings). */
async function walkCommandsForBindings(
  commandNodes: CommandExpressionNode[],
  bindings: BindingsManager,
  cache: BindingsManager,
  client: PublicClient,
): Promise<void> {
  let parentModule = "std";

  for (const c of commandNodes) {
    if (hasCommandsBlock(c)) {
      parentModule = c.module ?? parentModule;
    }
    const commandModule = c.module ?? parentModule;

    const command = await resolveCommandNode(c, bindings, commandModule);
    if (!command) continue;

    const customTypes = collectCustomTypes(bindings);

    for (let i = 0; i < command.argDefs.length; i++) {
      const argDef = command.argDefs[i];
      const argNode = c.args[i];
      if (!argNode) continue;

      // Built-in "variable" type: auto-create USER binding
      if (argDef.type === "variable" && argNode.value) {
        try {
          bindings.setBinding(argNode.value, argNode.value, USER);
        } catch {
          // binding already exists
        }
        continue;
      }

      // Custom type with resolve: call it to produce bindings
      if (!isBuiltinType(argDef.type)) {
        const customType = customTypes[argDef.type];
        if (customType?.resolve && argNode.value) {
          try {
            const ctx: CompletionContext = {
              argIndex: i,
              nodeArgs: c.args,
              bindings,
              position: { line: 0, col: 0 },
              client,
              cache,
              commandNode: c,
            };
            const newBindings = await customType.resolve(argNode.value, ctx);
            for (const b of newBindings) {
              try {
                bindings.setBinding(
                  b.identifier,
                  b.value,
                  b.type,
                  false,
                  undefined,
                  true,
                );
              } catch {
                // ignore duplicate binding errors
              }
            }
          } catch {
            // resolve failed, skip
          }
        }
      }
    }

    // If command has a block arg, enter a scope for the block body
    const blockArg = c.args.find((a) => a.type === NodeType.BlockExpression) as
      | BlockExpressionNode
      | undefined;
    if (blockArg) {
      bindings.enterScope(commandModule);
    }
  }
}

// ---------------------------------------------------------------------------
// Main completion function
// ---------------------------------------------------------------------------

export async function getCompletions(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
  client?: PublicClient,
): Promise<CompletionItem[]> {
  // 1. Parse the full script
  let fullAST: EvmlAST;
  try {
    const result = parseScript(script);
    fullAST = result.ast;
  } catch {
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
  } catch {
    return [];
  }

  let currentCommandNode = currentLineAST.getCommandAtLine(position.line);

  // Fallback: if the parser couldn't produce a command node (e.g. because of
  // an incomplete --opt at the end of the line), strip the trailing opt text
  // and re-parse to recover the command context.
  if (!currentCommandNode) {
    const textBeforeCursor = currentLineContent.slice(0, position.col);
    const stripped = textBeforeCursor.replace(/\s+--[\w-]*\s*$/, "");
    if (stripped !== textBeforeCursor) {
      try {
        const result = parseScript(
          [...Array(position.line - 1).map(() => ""), stripped].join("\n"),
        );
        currentCommandNode = result.ast.getCommandAtLine(position.line);
      } catch {
        /* ignore – proceed without a command node */
      }
    }
  }

  // Suppress completions inside string literals
  const deepestResult = currentCommandNode
    ? getDeepestNodeWithArgs(currentCommandNode, position)
    : { arg: undefined };

  if (
    currentCommandNode &&
    deepestResult.arg &&
    deepestResult.arg.type === NodeType.StringLiteral
  ) {
    return [];
  }

  // 2. Collect commands before cursor
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

  // 3. Seed bindings once, then walk commands to resolve bindings
  const bindings = new BindingsManager();
  seedBindings(bindings, moduleCache);

  await walkCommandsForBindings(
    commandNodes,
    bindings,
    moduleCache,
    client as PublicClient,
  );

  // Also walk the current command to populate bindings for its own completions
  // (e.g. grant's role arg needs to resolve the grantee and app args first)
  if (currentCommandNode) {
    await walkCommandsForBindings(
      [currentCommandNode],
      bindings,
      moduleCache,
      client as PublicClient,
    );
  }

  // 4. Build completion items
  const { commandItems, helperItems } = buildModuleCompletionItems(bindings);
  const emptyLine = !currentLineContent.trim().length;

  const displayCommandSuggestions =
    emptyLine ||
    (!!currentCommandNode?.loc &&
      position.col >= 0 &&
      position.col <= calculateCommandNameLength(currentCommandNode));

  if (displayCommandSuggestions) {
    return commandItems;
  }

  if (currentCommandNode) {
    const command = await resolveCommandNode(
      currentCommandNode,
      bindings,
      contextModuleName,
    );

    if (command) {
      const argIndex = calculateCurrentArgIndex(currentCommandNode, position);

      // Detect if the user is typing an opt name or an opt value
      const textBeforeCursor = currentLineContent.slice(0, position.col);
      const currentWord = textBeforeCursor.match(/(\S+)$/)?.[1] ?? "";
      const isTypingOpt = currentWord.startsWith("--");

      const optItems = buildOptCompletionItems(command, currentCommandNode);

      if (isTypingOpt) {
        return optItems;
      }

      // Check if cursor is at an opt's value position (e.g. "--value <cursor>"
      // or "--value 0x<cursor>")
      const prevWordMatch = textBeforeCursor.match(/--(\S+)\s+\S*$/);
      if (prevWordMatch) {
        const optName = prevWordMatch[1];
        const optDef = command.optDefs.find((o) => o.name === optName);
        if (optDef) {
          const ctx: CompletionContext = {
            argIndex: -1,
            nodeArgs: currentCommandNode.args,
            bindings,
            position,
            client: client as PublicClient,
            cache: moduleCache,
            commandNode: currentCommandNode,
          };
          const customTypes = collectCustomTypes(bindings);
          const typeDrivenItems = await completionsForType(
            optDef.type,
            ctx,
            customTypes,
          );
          const filteredHelpers = helperItems.filter((h) =>
            isReturnTypeCompatible(h.returnType, optDef.type),
          );
          const includeVars =
            isBuiltinType(optDef.type) &&
            optDef.type !== "bool" &&
            optDef.type !== "variable" &&
            optDef.type !== "block";
          const filteredVars = includeVars
            ? buildVarCompletionItems(bindings, currentCommandNode, position)
            : [];
          return [...typeDrivenItems, ...filteredHelpers, ...filteredVars];
        }
      }

      const argDef =
        command.argDefs[argIndex] ??
        (command.argDefs.at(-1)?.rest ? command.argDefs.at(-1) : undefined);

      if (argDef) {
        const ctx: CompletionContext = {
          argIndex,
          nodeArgs: currentCommandNode.args,
          bindings,
          position,
          client: client as PublicClient,
          cache: moduleCache,
          commandNode: currentCommandNode,
        };

        // Completion override → return ONLY override results
        if (command.completions?.[argDef.name]) {
          return command.completions[argDef.name](ctx);
        }

        // Resolve effective type (may be dynamic via resolveType)
        const effectiveType = argDef.resolveType?.(ctx) ?? argDef.type;

        // Type-driven completions + filtered helpers + filtered variables
        const customTypes = collectCustomTypes(bindings);
        const typeDrivenItems = await completionsForType(
          effectiveType,
          ctx,
          customTypes,
        );

        const filteredHelpers = helperItems.filter((h) =>
          isReturnTypeCompatible(h.returnType, effectiveType),
        );

        const includeVars =
          isBuiltinType(effectiveType) &&
          effectiveType !== "bool" &&
          effectiveType !== "variable" &&
          effectiveType !== "block";
        const filteredVars = includeVars
          ? buildVarCompletionItems(bindings, currentCommandNode, position)
          : [];

        // Show opts alongside arg completions once all mandatory args are filled
        const mandatoryBoundary = command.argDefs.findIndex(
          (a) => a.optional || a.rest,
        );
        const effectiveMandatoryCount =
          mandatoryBoundary === -1 ? command.argDefs.length : mandatoryBoundary;

        let showOpts = false;
        if (argIndex >= effectiveMandatoryCount) {
          if (argDef.rest) {
            const restIndex = command.argDefs.indexOf(argDef);
            showOpts = argIndex > restIndex;
          } else {
            showOpts = true;
          }
        }

        return [
          ...typeDrivenItems,
          ...filteredHelpers,
          ...filteredVars,
          ...(showOpts ? optItems : []),
        ];
      }

      // Past all args (no rest): show only opt items
      return optItems;
    }
  }

  // No command context: show all helpers and variables as fallback
  const variableItems = buildVarCompletionItems(
    bindings,
    currentCommandNode,
    position,
  );
  return [...helperItems, ...variableItems];
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
  } catch {
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

  const seenModules = new Set<string>();

  for (const c of loadNodes) {
    if (!c.args.length) continue;
    const moduleName: string = c.args[0].value;
    if (!moduleName || seenModules.has(moduleName)) continue;
    seenModules.add(moduleName);

    const moduleData = moduleCache.getBindingValue(moduleName, MODULE);
    if (!moduleData) continue;

    const asOpt = c.opts.find((o) => o.name === "as");
    const displayName: string = asOpt?.value?.value ?? moduleName;

    const commandNames = Object.keys(moduleData.commands).flatMap((name) => [
      name,
      `${displayName}:${name}`,
    ]);
    const helperNames = Object.keys(moduleData.helpers).map(
      (name) => `@${name}`,
    );
    commands.push(...commandNames);
    helpers.push(...helperNames);
  }

  return { commands, helpers };
}
