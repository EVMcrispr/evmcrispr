import type {
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionContext,
  CompletionItem,
  HelperArgDefEntry,
  HelperFunctionNode,
  HelperResolver,
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
  interpretNodeSync,
  isBuiltinType,
  NodeType,
  parseSignatureParamTypes,
  resolveCommand,
  variableItem,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as viemChains from "viem/chains";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";

// ---------------------------------------------------------------------------
// Chain resolution for `switch` commands during completion
// ---------------------------------------------------------------------------

const nameToChainId: Record<string, number> = Object.entries(viemChains).reduce(
  (acc, [name, chain]) => {
    acc[name] = (chain as Chain).id;
    return acc;
  },
  {} as Record<string, number>,
);

/** Resolve a `switch` command's argument to a chain ID, or return undefined. */
function resolveSwitchChainId(
  commandNode: CommandExpressionNode,
  _bindings: BindingsManager,
): number | undefined {
  if (commandNode.name !== "switch") return undefined;
  const argNode = commandNode.args[0];
  if (!argNode) return undefined;

  const raw = argNode.value;
  if (raw == null) return undefined;

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber > 0) return asNumber;
  if (typeof raw === "string") return nameToChainId[raw];
  return undefined;
}

/** Create a PublicClient for the given chain ID, or return undefined. */
function clientForChain(
  chainId: number,
  transports?: Record<number, Transport>,
): PublicClient | undefined {
  const chain = Object.values(viemChains).find(
    (c) => (c as Chain).id === chainId,
  ) as Chain | undefined;
  if (!chain) return undefined;
  return createPublicClient({
    chain,
    transport: transports?.[chainId] ?? http(),
  }) as PublicClient;
}

const { MODULE, USER, CACHE } = BindingsSpace;

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
): {
  commandItems: CompletionItem[];
  helperItems: CompletionItem[];
  helperArgDefsMap: Record<string, HelperArgDefEntry[]>;
} => {
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

  const helperArgDefsMap: Record<string, HelperArgDefEntry[]> = {};
  for (const { value: mod } of dedupedBindings) {
    if (mod.helperArgDefs) {
      for (const [name, defs] of Object.entries(mod.helperArgDefs)) {
        helperArgDefsMap[name] = defs;
      }
    }
  }

  return {
    commandItems: dedupedBindings.flatMap(({ value: mod }, index) => {
      const moduleAlias = moduleAliases[index];
      return Object.keys(mod.commands).map((commandName): CompletionItem => {
        const prefix = scopeModule === moduleAlias ? "" : `${moduleAlias}:`;
        const label = `${prefix}${commandName}`;
        return {
          label,
          insertText: label,
          kind: "command",
          documentation: mod.commandDescriptions?.[commandName],
        };
      });
    }),

    helperItems: dedupedBindings.flatMap(({ value: mod }) => {
      return Object.keys(mod.helpers).map((helperName): CompletionItem => {
        const hasArgs = mod.helperHasArgs?.[helperName] ?? false;
        const returnType = mod.helperReturnTypes?.[helperName];
        return {
          label: `@${helperName}`,
          insertText: hasArgs ? `@${helperName}($0)` : `@${helperName} `,
          kind: "helper",
          sortPriority: 3,
          returnType,
          isSnippet: hasArgs,
          detail: returnType ? `→ ${returnType}` : undefined,
          documentation: mod.helperDescriptions?.[helperName],
        };
      });
    }),

    helperArgDefsMap,
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

/**
 * Resolve the value node of a `set` command.  Tries, in order:
 *   1. `interpretNodeSync` for literals / variable references
 *   2. Helper execution (cached in the CACHE space) for HelperFunctionExpression
 *   3. Falls back to storing the AST node itself
 */
async function resolveValueNode(
  valueNode: { type: any; value?: any; [k: string]: any },
  bindings: BindingsManager,
  cache: BindingsManager,
  chainId: number,
  client: PublicClient | undefined,
  resolveHelper?: HelperResolver,
): Promise<any> {
  // Fast path: literals, barewords, variable references
  const syncResult = interpretNodeSync(valueNode as any, bindings);
  if (syncResult != null) return syncResult;

  // Helper expression: resolve via cache + executor
  if (
    valueNode.type === NodeType.HelperFunctionExpression &&
    resolveHelper &&
    client
  ) {
    const helperNode = valueNode as unknown as HelperFunctionNode;
    const resolvedArgs: string[] = [];
    let allResolved = true;

    for (const arg of helperNode.args) {
      const v = interpretNodeSync(arg as any, bindings);
      if (v == null) {
        allResolved = false;
        break;
      }
      resolvedArgs.push(String(v));
    }

    if (allResolved) {
      const cacheKey = `helper:${chainId}:${
        helperNode.name
      }:${resolvedArgs.join(":")}`;
      const cached = cache.getBindingValue(cacheKey, CACHE);
      if (cached != null) return cached;

      try {
        const result = await resolveHelper(
          helperNode.name,
          resolvedArgs,
          chainId,
          client,
          bindings,
        );
        cache.setBinding(cacheKey, result, CACHE, false, undefined, true);
        return result;
      } catch {
        // Helper execution failed — fall through to AST node fallback
      }
    }
  }

  // Fallback: store the AST node itself
  return valueNode;
}

/** Walk a list of fully-typed command nodes and resolve any bindings they
 *  produce (variable → USER, custom type with resolve → arbitrary bindings). */
async function walkCommandsForBindings(
  commandNodes: CommandExpressionNode[],
  bindings: BindingsManager,
  cache: BindingsManager,
  client: PublicClient,
  chainId: number,
  resolveHelper?: HelperResolver,
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
        let bindingValue: any = argNode.value;
        if (c.name === "set" && c.args[i + 1]) {
          const valueNode = c.args[i + 1];
          bindingValue = await resolveValueNode(
            valueNode,
            bindings,
            cache,
            chainId,
            client,
            resolveHelper,
          );
        }
        try {
          bindings.setBinding(argNode.value, bindingValue, USER);
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
              chainId,
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
  resolveHelper?: HelperResolver,
  transports?: Record<number, Transport>,
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
  let currentLineAST: EvmlAST | undefined;
  try {
    const result = parseScript(
      [
        ...Array(position.line - 1).map(() => ""),
        removePossibleFollowingBlock(currentLineContent, position),
      ].join("\n"),
    );
    currentLineAST = result.ast;
  } catch {
    // Current-line parse may fail when cursor is inside helper parens
    // (the closing paren gets stripped). Fall through to use fullAST.
  }

  let currentCommandNode =
    currentLineAST?.getCommandAtLine(position.line) ??
    fullAST.getCommandAtLine(position.line);

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

  // Fallback: if the cursor follows a trailing comma inside helper/call parens
  // (e.g. "@token.amount(WXDAI, )"), the parser produces an empty AST. Inject
  // a placeholder bareword at the cursor position so the parser succeeds.
  if (!currentCommandNode) {
    const textBeforeCursor = currentLineContent.slice(0, position.col);
    const afterCursor = currentLineContent.slice(position.col);
    if (/,\s*$/.test(textBeforeCursor) && /^\s*\)/.test(afterCursor)) {
      try {
        const patched = `${textBeforeCursor}_${afterCursor}`;
        const result = parseScript(
          [...Array(position.line - 1).map(() => ""), patched].join("\n"),
        );
        currentCommandNode = result.ast.getCommandAtLine(position.line);
      } catch {
        /* ignore */
      }
    }
  }

  // Fallback: if the cursor is inside unclosed parentheses (user is still
  // typing, no closing paren yet), try closing them.  Also insert a
  // placeholder when the text ends with a trailing comma.
  if (!currentCommandNode) {
    const textBeforeCursor = currentLineContent.slice(0, position.col);
    const afterCursor = currentLineContent.slice(position.col);
    if (!afterCursor.includes(")")) {
      const placeholder = /,\s*$/.test(textBeforeCursor) ? "_" : "";
      let closers = "";
      for (let i = 0; i < 5; i++) {
        closers += ")";
        const patched = textBeforeCursor + placeholder + closers + afterCursor;
        try {
          const result = parseScript(
            [...Array(position.line - 1).map(() => ""), patched].join("\n"),
          );
          const cmd = result.ast.getCommandAtLine(position.line);
          if (cmd) {
            currentCommandNode = cmd;
            break;
          }
        } catch {
          /* try more close parens */
        }
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
    .getCommandsUntilLine(position.line - 1, ["load", "set", "switch"])
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

  // Resolve the effective chain by scanning for `switch` commands before the
  // cursor.  The last `switch` wins, just as it would during execution.
  let effectiveClient = client;
  for (const c of commandNodes) {
    const switchedChainId = resolveSwitchChainId(c, bindings);
    if (switchedChainId != null) {
      const newClient = clientForChain(switchedChainId, transports);
      if (newClient) {
        effectiveClient = newClient;
      }
    }
  }

  let chainId = 0;
  try {
    chainId = (await effectiveClient?.getChainId()) ?? 0;
  } catch {
    // RPC unavailable — proceed with chainId 0
  }

  await walkCommandsForBindings(
    commandNodes,
    bindings,
    moduleCache,
    effectiveClient as PublicClient,
    chainId,
    resolveHelper,
  );

  // Also walk the current command to populate bindings for its own completions
  // (e.g. grant's role arg needs to resolve the grantee and app args first)
  if (currentCommandNode) {
    await walkCommandsForBindings(
      [currentCommandNode],
      bindings,
      moduleCache,
      effectiveClient as PublicClient,
      chainId,
      resolveHelper,
    );
  }

  // 4. Build completion items
  const { commandItems, helperItems, helperArgDefsMap } =
    buildModuleCompletionItems(bindings);
  const emptyLine = !currentLineContent.trim().length;

  const displayCommandSuggestions =
    emptyLine ||
    (!!currentCommandNode?.loc &&
      position.col >= 0 &&
      position.col <= calculateCommandNameLength(currentCommandNode));

  if (displayCommandSuggestions) {
    return commandItems;
  }

  // 4b. If cursor is inside a helper's argument list, provide completions
  //     based on the helper's own argDefs rather than the enclosing command's.
  if (
    currentCommandNode &&
    "node" in deepestResult &&
    deepestResult.node !== currentCommandNode &&
    (deepestResult.node as any).type === NodeType.HelperFunctionExpression
  ) {
    const helperNode = deepestResult.node as unknown as HelperFunctionNode;
    const argDefs = helperArgDefsMap[helperNode.name];
    if (argDefs) {
      const helperArgIndex = deepestResult.argIndex;
      const argDef =
        argDefs[helperArgIndex] ??
        (argDefs.at(-1)?.rest ? argDefs.at(-1) : undefined);
      if (argDef) {
        let effectiveType = argDef.type;
        if (argDef.signatureArgIndex != null) {
          const sigNode = helperNode.args[argDef.signatureArgIndex];
          if (sigNode?.value) {
            const paramTypes = parseSignatureParamTypes(sigNode.value);
            const paramIndex = helperArgIndex - (argDef.signatureArgIndex + 1);
            effectiveType = paramTypes[paramIndex] ?? effectiveType;
          }
        }
        const ctx: CompletionContext = {
          argIndex: helperArgIndex,
          nodeArgs: helperNode.args,
          bindings,
          position,
          client: effectiveClient as PublicClient,
          chainId,
          cache: moduleCache,
        };
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
          effectiveType !== "address" &&
          effectiveType !== "number" &&
          effectiveType !== "bool" &&
          effectiveType !== "variable" &&
          effectiveType !== "block";
        const filteredVars = includeVars
          ? buildVarCompletionItems(bindings, currentCommandNode, position)
          : [];
        return [...typeDrivenItems, ...filteredHelpers, ...filteredVars];
      }
    }
    return [];
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
            client: effectiveClient as PublicClient,
            chainId,
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
            optDef.type !== "address" &&
            optDef.type !== "number" &&
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
          client: effectiveClient as PublicClient,
          chainId,
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
          effectiveType !== "address" &&
          effectiveType !== "number" &&
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
