import type {
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionContext,
  CompletionItem,
  HelperArgDefEntry,
  HelperFunctionNode,
  HelperResolver,
  ICommand,
  ImportValue,
  ModuleBinding,
  NoNullableBinding,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  calculateCurrentArgIndex,
  completionsForType,
  findAbiArgForRest,
  getDeepestNodeWithArgs,
  hasCommandsBlock,
  isBuiltinType,
  isExperimentalEnabled,
  NodeType,
  parseImportList,
  parseReadAbiParamTypes,
  parseSignatureParamTypes,
  resolveArgDefIndex,
  variableItem,
} from "@evmcrispr/sdk";
import type { PublicClient, Transport } from "viem";
import { mainnet } from "viem/chains";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";
import {
  applyLoadImports,
  clientForChain,
  collectCustomTypes,
  createNodeResolver,
  resolveCommandNode,
  seedBindings,
  type WalkChainState,
  walkCommandsForBindings,
} from "./scriptWalk";

const { MODULE, USER } = BindingsSpace;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return currentLine.slice(0, currPos.col);
};

// ---------------------------------------------------------------------------
// Completion item builders
// ---------------------------------------------------------------------------

/** Canonical lookup key for a helper node: the spelling used in the script
 *  (`ens:addr` for qualified, `addr` for imported/std names). Matches how
 *  `buildModuleCompletionItems` keys `helperArgDefsMap`. */
const helperNodeKey = (h: { module?: string; name: string }): string =>
  h.module ? `${h.module}:${h.name}` : h.name;

const buildModuleCompletionItems = (
  bindings: BindingsManager,
): {
  commandItems: CompletionItem[];
  helperItems: CompletionItem[];
  helperArgDefsMap: Record<string, HelperArgDefEntry[]>;
} => {
  const moduleBindings = bindings.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const seenValues = new Set<object>();
  const dedupedBindings = moduleBindings.filter((b) => {
    if (!b.value || seenValues.has(b.value)) return false;
    seenValues.add(b.value);
    return true;
  });

  const byName = new Map(dedupedBindings.map((b) => [b.identifier, b.value]));

  const importBindings = bindings.getAllBindings({
    spaceFilters: [BindingsSpace.IMPORT],
    ignoreNullValues: true,
  }) as { identifier: string; value: ImportValue }[];

  const commandItems: CompletionItem[] = [];
  const helperItems: CompletionItem[] = [];
  const helperArgDefsMap: Record<string, HelperArgDefEntry[]> = {};

  const pushHelperItem = (
    mod: (typeof dedupedBindings)[number]["value"],
    localName: string,
    spelled: string,
  ) => {
    const hasArgs = mod.helperHasArgs?.[localName] ?? false;
    const returnType = mod.helperReturnTypes?.[localName];
    helperItems.push({
      label: `@${spelled}`,
      insertText: hasArgs ? `@${spelled}($0)` : `@${spelled} `,
      kind: "helper",
      sortPriority: 3,
      returnType,
      isSnippet: hasArgs,
      detail: returnType ? `→ ${returnType}` : undefined,
      documentation: mod.helperDescriptions?.[localName],
    });
    if (mod.helperArgDefs?.[localName]) {
      helperArgDefsMap[spelled] = mod.helperArgDefs[localName];
    }
  };

  const pushConstantItem = (spelled: string, value: string) => {
    helperItems.push({
      label: `@${spelled}`,
      insertText: `@${spelled} `,
      kind: "helper",
      sortPriority: 3,
      detail: value,
    });
  };

  for (const { identifier: moduleName, value: mod } of dedupedBindings) {
    // std is the prelude — its names are unqualified. Everything else is
    // offered under its module namespace; imports below add the
    // unqualified spellings the script's load lines opted into.
    const prefix = moduleName === "std" ? "" : `${moduleName}:`;

    for (const commandName of Object.keys(mod.commands)) {
      const label = `${prefix}${commandName}`;
      commandItems.push({
        label,
        insertText: label,
        kind: "command",
        documentation: mod.commandDescriptions?.[commandName],
      });
    }
    for (const helperName of Object.keys(mod.helpers)) {
      pushHelperItem(mod, helperName, `${prefix}${helperName}`);
    }
    for (const [constName, constValue] of Object.entries(mod.constants ?? {})) {
      pushConstantItem(`${prefix}${constName}`, constValue);
    }
  }

  for (const { identifier, value: imp } of importBindings) {
    const mod = byName.get(imp.module);
    if (!mod) continue;
    if (imp.kind === "command") {
      commandItems.push({
        label: identifier,
        insertText: identifier,
        kind: "command",
        documentation: mod.commandDescriptions?.[imp.name],
      });
    } else if (imp.kind === "helper") {
      // identifier is `@boundName`
      pushHelperItem(mod, imp.name, identifier.slice(1));
    } else if (mod.constants?.[imp.name] !== undefined) {
      pushConstantItem(identifier.slice(1), mod.constants[imp.name]);
    }
  }

  return { commandItems, helperItems, helperArgDefsMap };
};

const buildOptCompletionItems = (
  command: ICommand,
  currentCommandNode: CommandExpressionNode,
): CompletionItem[] => {
  const usedOpts = new Set(currentCommandNode.opts.map((o) => o.name));
  return command.optDefs
    .filter((o) => !usedOpts.has(o.name))
    .filter((o) => !o.experimental || isExperimentalEnabled())
    .map(
      (o): CompletionItem => ({
        label: `--${o.name}`,
        insertText: `--${o.name} `,
        kind: "field",
        sortPriority: 4,
      }),
    );
};

/** One item per declared config variable of every loaded module
 *  (`$safe:serviceUrl` etc.), with type/default/description metadata. */
const buildConfigVarItems = (bindings: BindingsManager): CompletionItem[] => {
  const moduleBindings = bindings.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];

  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  for (const { identifier: moduleName, value: mod } of moduleBindings) {
    if (seen.has(moduleName)) continue;
    seen.add(moduleName);
    for (const cfg of mod.configs ?? []) {
      const label = `$${moduleName}:${cfg.name}`;
      const type = Array.isArray(cfg.type) ? cfg.type.join(" | ") : cfg.type;
      items.push({
        label,
        insertText: label,
        kind: "variable",
        sortPriority: 2,
        detail: cfg.default ? `${type} · default: ${cfg.default}` : type,
        documentation: cfg.description,
      });
    }
  }
  return items;
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
      // Binding position: offer the declared config variables of loaded
      // modules (set is the only command that may bind them).
      return buildConfigVarItems(bindings);
    }
    if (currentArgIndex === 1) {
      const currentVarName = currentCommandNode.args[0]?.value;
      varNames = varNames.filter(
        (varName: string) => varName !== currentVarName,
      );
    }
  }

  // Read positions: plain variables only. Declared-but-unset module configs
  // are offered exclusively in set's binding slot (configs that were set
  // appear in USER space with the same spelling, so they show up here).
  return varNames.map((name: string) => variableItem(name));
};

// ---------------------------------------------------------------------------
// Type-compatibility check for filtering helpers / variables
// ---------------------------------------------------------------------------

/** Normalize an ArgType to an array of single type tags. */
function toTypeArray(type: string | string[] | undefined): string[] {
  if (type == null) return ["string"];
  return Array.isArray(type) ? type : [type];
}

const VAR_EXCLUDED_TYPES = new Set([
  "address",
  "number",
  "bool",
  "variable",
  "block",
]);

/** Whether variable completions should be included for the given type. */
function shouldIncludeVars(type: string | string[]): boolean {
  const types = toTypeArray(type);
  return isBuiltinType(type) && types.some((t) => !VAR_EXCLUDED_TYPES.has(t));
}

/** Check if a helper with the given return type can produce a value compatible
 *  with the expected argument type. */
function isReturnTypeCompatible(
  returnType: string | string[] | undefined,
  expectedType: string | string[],
): boolean {
  const expected = toTypeArray(expectedType);
  // Expression slots accept any value, including helper results
  if (
    expected.includes("any") ||
    expected.includes("string") ||
    expected.includes("expression")
  ) {
    return true;
  }
  if (expected.every((t) => t === "variable" || t === "block")) return false;
  if (!expected.some((t) => isBuiltinType(t))) return false;
  const rt = toTypeArray(returnType);
  if (rt.includes("any")) return true;
  return rt.some((r) => expected.includes(r));
}

// ---------------------------------------------------------------------------
// Main completion function
// ---------------------------------------------------------------------------

/**
 * True when the (1-indexed) cursor line sits inside an unclosed `<<<TAG`
 * heredoc block. Line-based on purpose: completions work over raw text and
 * the block content is not EVML.
 */
function isInsideHeredoc(lines: string[], cursorLine: number): boolean {
  let sentinel: string | null = null;
  for (let i = 0; i < cursorLine - 1 && i < lines.length; i++) {
    const line = lines[i];
    if (sentinel) {
      if (new RegExp(`^${sentinel}(?![A-Za-z0-9_])`).test(line)) {
        sentinel = null;
      }
    } else {
      const m = line.match(/<<<([A-Z][A-Z0-9]*)\b/);
      if (m) sentinel = m[1];
    }
  }
  return sentinel !== null;
}

export async function getCompletions(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
  resolveHelper?: HelperResolver,
  transports?: Record<number, Transport>,
  initialChainId: number = mainnet.id,
): Promise<CompletionItem[]> {
  // The walk starts on the caller-provided chain (defaults to mainnet)
  // and advances `state` in place when it sees a `switch` command, so
  // completions for code under a `switch optimism` block will see
  // chain id 10. The caller (EvmlWorkspace) typically passes its own
  // `#chainId` so completions match what the script actually runs
  // against (e.g. tests forking gnosis pass 100).
  const client: PublicClient | undefined = clientForChain(
    initialChainId,
    transports,
  );
  // 1. Parse the full script
  const scriptLines = script.split("\n");
  const currentLineContent = scriptLines[position.line - 1] ?? "";

  // Inside an open <<<TAG heredoc block the content is foreign code
  // (e.g. Solidity) — EVML suggestions there are pure noise.
  if (isInsideHeredoc(scriptLines, position.line)) return [];

  let fullAST: EvmlAST | undefined;
  try {
    const result = parseScript(script);
    fullAST = result.ast;
  } catch {
    // Full parse failed (user is mid-edit). Try parsing only the lines before
    // the cursor so we can still resolve preceding bindings / switch commands.
    try {
      const linesBefore = scriptLines.slice(0, position.line - 1);
      if (linesBefore.length > 0) {
        const partial = parseScript(linesBefore.join("\n"));
        fullAST = partial.ast;
      }
    } catch {
      // Even partial parse failed — proceed without context
    }
  }

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
    fullAST?.getCommandAtLine(position.line);

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

  // Fallback: if the cursor is inside unclosed parentheses, try closing them.
  // Also insert a placeholder when the text ends with a trailing comma.
  // Close unclosed string quotes before appending paren closers so the parser
  // succeeds when the cursor is mid-string (e.g. `@json($data, "tokens.`).
  if (!currentCommandNode) {
    const textBeforeCursor = currentLineContent.slice(0, position.col);
    const afterCursor = currentLineContent.slice(position.col);
    const unclosedCount =
      (textBeforeCursor.match(/\(/g) || []).length -
      (textBeforeCursor.match(/\)/g) || []).length;

    const doubleQuotes = (textBeforeCursor.match(/"/g) || []).length;
    const singleQuotes = (textBeforeCursor.match(/'/g) || []).length;
    const closeQuote =
      doubleQuotes % 2 !== 0 ? '"' : singleQuotes % 2 !== 0 ? "'" : "";

    if (!afterCursor.includes(")") || unclosedCount > 0 || closeQuote) {
      const placeholder = /,\s*$/.test(textBeforeCursor) ? "_" : "";
      const suffix = unclosedCount > 0 ? "" : afterCursor;
      let closers = "";
      for (let i = 0; i < 5; i++) {
        closers += ")";
        const patched =
          textBeforeCursor + placeholder + closeQuote + closers + suffix;
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

  const deepestResult = currentCommandNode
    ? getDeepestNodeWithArgs(currentCommandNode, position)
    : { arg: undefined };

  const isInsideString =
    currentCommandNode &&
    deepestResult.arg &&
    deepestResult.arg.type === NodeType.StringLiteral;

  // Simple string literal suppression: if we're inside a string and the
  // enclosing node is NOT a helper (i.e. it's a command arg), suppress now
  // before bindings are available.
  if (isInsideString) {
    const helperNode = "node" in deepestResult ? deepestResult.node : undefined;
    if (
      !helperNode ||
      (helperNode as any).type !== NodeType.HelperFunctionExpression
    ) {
      return [];
    }
    // For helper args, defer the check until after bindings are seeded (below)
  }

  // 2. Collect commands before cursor
  const commandNodes: CommandExpressionNode[] = (
    fullAST?.getCommandsUntilLine(position.line - 1, [
      "load",
      "set",
      "switch",
    ]) ?? []
  ).filter((c: any) => {
    const itHasCommandsBlock = hasCommandsBlock(c);
    const loc = c.loc;
    const currentLine = position.line;
    return (
      !itHasCommandsBlock ||
      (loc && currentLine >= loc.start.line && currentLine <= loc.end.line)
    );
  });

  // 3. Seed bindings once, then walk commands to resolve bindings
  const bindings = new BindingsManager();
  seedBindings(bindings, moduleCache);

  // Seed IMPORT bindings up front (the walk re-applies them, overwrite-safe):
  // the string-literal suppression check below resolves helper names before
  // the walk runs, and unqualified imported helpers must already resolve.
  for (const c of commandNodes) applyLoadImports(c, bindings);

  // Deferred string literal suppression for helper args: now that bindings are
  // available, check whether the enclosing helper arg has a custom type with
  // completions. If not, suppress.
  if (isInsideString && "node" in deepestResult) {
    const helperNode = deepestResult.node as unknown as HelperFunctionNode;
    const { helperArgDefsMap: earlyHelperArgDefsMap } =
      buildModuleCompletionItems(bindings);
    const argDefs = earlyHelperArgDefsMap[helperNodeKey(helperNode)];
    const argDef = argDefs?.[deepestResult.argIndex];
    if (argDef && !isBuiltinType(argDef.type)) {
      const customTypes = collectCustomTypes(bindings);
      const customType = customTypes[argDef.type as string];
      if (!customType?.completions) {
        return [];
      }
    } else {
      return [];
    }
  }

  // Walk the script in command order, advancing chain state as we hit
  // each `switch`. After the walk, `state` reflects the chain that's
  // active at the cursor — the same value the previous pre-pass
  // computed, but with each `set` rhs resolved against the chain it
  // was actually written under (mainnet WETH stays a mainnet address
  // even after the script switches to optimism later on).
  const state: WalkChainState = {
    chainId: initialChainId,
    client,
    transports,
  };

  const resolveNode = createNodeResolver(
    bindings,
    moduleCache,
    state,
    resolveHelper,
  );

  await walkCommandsForBindings(
    commandNodes,
    bindings,
    moduleCache,
    state,
    resolveNode,
  );

  // Also walk the current command to populate bindings for its own completions
  // (e.g. grant's role arg needs to resolve the grantee and app args first)
  if (currentCommandNode) {
    await walkCommandsForBindings(
      [currentCommandNode],
      bindings,
      moduleCache,
      state,
      resolveNode,
    );
  }

  const chainId = state.chainId;
  const effectiveClient = state.client;

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
    const argDefs = helperArgDefsMap[helperNodeKey(helperNode)];
    if (argDefs) {
      const helperArgIndex = deepestResult.argIndex;
      const argDef =
        argDefs[helperArgIndex] ??
        (argDefs.at(-1)?.rest ? argDefs.at(-1) : undefined);
      if (argDef) {
        let effectiveType = argDef.type;
        if (argDef.rest) {
          const restDefIndex = argDefs.indexOf(argDef);
          const abiInfo = findAbiArgForRest(argDefs, restDefIndex);
          if (abiInfo) {
            const sigNode = helperNode.args[abiInfo.sigIndex];
            if (sigNode?.value) {
              const parser = abiInfo.isReadAbi
                ? parseReadAbiParamTypes
                : parseSignatureParamTypes;
              const paramTypes = parser(sigNode.value);
              const paramIndex = helperArgIndex - (abiInfo.sigIndex + 1);
              effectiveType = paramTypes[paramIndex] ?? effectiveType;
            }
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
          resolveNode,
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
        const filteredVars = shouldIncludeVars(effectiveType)
          ? buildVarCompletionItems(bindings, currentCommandNode, position)
          : [];
        return [...typeDrivenItems, ...filteredHelpers, ...filteredVars];
      }
    }
    return [];
  }

  // 4c. If cursor is inside a ::{}  inline-ABI call's args, derive types from
  //     the embedded input types.
  if (
    currentCommandNode &&
    "node" in deepestResult &&
    deepestResult.node !== currentCommandNode &&
    (deepestResult.node as any).type === NodeType.CallExpression
  ) {
    const callNode = deepestResult.node as any;
    if (callNode.inputTypes) {
      const paramTypes = parseSignatureParamTypes(`fn${callNode.inputTypes}`);
      const callArgIndex = deepestResult.argIndex;
      const effectiveType = paramTypes[callArgIndex] ?? "any";
      const ctx: CompletionContext = {
        argIndex: callArgIndex,
        nodeArgs: callNode.args,
        bindings,
        position,
        client: effectiveClient as PublicClient,
        chainId,
        cache: moduleCache,
        resolveNode,
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
      const filteredVars = shouldIncludeVars(effectiveType)
        ? buildVarCompletionItems(bindings, currentCommandNode, position)
        : [];
      return [...typeDrivenItems, ...filteredHelpers, ...filteredVars];
    }
  }

  if (currentCommandNode) {
    const command = await resolveCommandNode(currentCommandNode, bindings);

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
            resolveNode,
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
          const filteredVars = shouldIncludeVars(optDef.type)
            ? buildVarCompletionItems(bindings, currentCommandNode, position)
            : [];
          return [...typeDrivenItems, ...filteredHelpers, ...filteredVars];
        }
      }

      const argDefIdx = resolveArgDefIndex(
        command.argDefs,
        currentCommandNode.args,
        argIndex,
      );
      const argDef =
        (argDefIdx >= 0 ? command.argDefs[argDefIdx] : undefined) ??
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
          resolveNode,
        };

        // Completion override. For a pure keyword slot (`command` type, or
        // any single-typed arg) it fully replaces the suggestions; on a
        // union type it only covers the `command` member (e.g. `max`) and
        // the remaining members keep their type-driven completions
        // (number helpers, variables, ...).
        let overrideItems: CompletionItem[] = [];
        let overrideType: string | string[] | undefined;
        if (command.completions?.[argDef.name]) {
          overrideItems = await command.completions[argDef.name](ctx);
          const nonCommand = Array.isArray(argDef.type)
            ? argDef.type.filter((t) => t !== "command")
            : [];
          if (nonCommand.length === 0) {
            return overrideItems;
          }
          overrideType = nonCommand.length === 1 ? nonCommand[0] : nonCommand;
        }

        // Resolve effective type — auto-detect ABI arg for rest params
        let effectiveType: string | string[] = overrideType ?? argDef.type;
        if (argDef.rest) {
          const restDefIndex = command.argDefs.indexOf(argDef);
          const abiInfo = findAbiArgForRest(command.argDefs, restDefIndex);
          if (abiInfo) {
            const sigNode = currentCommandNode.args[abiInfo.sigIndex];
            if (sigNode?.value) {
              const parser = abiInfo.isReadAbi
                ? parseReadAbiParamTypes
                : parseSignatureParamTypes;
              const paramTypes = parser(sigNode.value);
              const paramIndex = argIndex - (abiInfo.sigIndex + 1);
              effectiveType = paramTypes[paramIndex] ?? effectiveType;
            }
          }
        }

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

        const filteredVars = shouldIncludeVars(effectiveType)
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

        // Binding positions that accept config vars (set's variable arg)
        // additionally offer every declared config of the loaded modules.
        const configItems = argDef.allowConfig
          ? buildConfigVarItems(bindings)
          : [];

        return [
          ...overrideItems,
          ...typeDrivenItems,
          ...configItems,
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
    "def",
  ]);
  const loadNodes = commandNodes.filter(
    (c: CommandExpressionNode) => c.name === "load",
  );
  const moduleNodes = commandNodes.filter(
    (c: CommandExpressionNode) =>
      c.name === "def" &&
      c.args[0]?.type === NodeType.Bareword &&
      c.args[0].value === "module",
  );

  const stdModuleData = moduleCache.getBindingValue("std", MODULE);
  const commands: string[] = stdModuleData
    ? Object.keys(stdModuleData.commands).flatMap((name) => [
        name,
        `std:${name}`,
      ])
    : [];
  const helpers: string[] = stdModuleData
    ? [
        ...Object.keys(stdModuleData.helpers).flatMap((name) => [
          `@${name}`,
          `@std:${name}`,
        ]),
        ...Object.keys(stdModuleData.constants ?? {}).flatMap((name) => [
          `@${name}`,
          `@std:${name}`,
        ]),
      ]
    : [];

  for (const c of commandNodes) {
    if (c.name !== "def" || !c.args.length) continue;
    const nameArg = c.args[0];
    if (nameArg.type === NodeType.Bareword) {
      if (nameArg.value === "module") continue; // handled below
      commands.push(nameArg.value as string);
    } else if (nameArg.type === NodeType.HelperFunctionExpression) {
      helpers.push(`@${(nameArg as HelperFunctionNode).name}`);
    }
  }

  // Inline `def module` blocks: qualified spellings for the block's defs.
  for (const c of moduleNodes) {
    const nameArg = c.args[1];
    if (nameArg?.type !== NodeType.Bareword) continue;
    const alias = nameArg.value as string;
    const blockNode = c.args.find((a) => a.type === NodeType.BlockExpression) as
      | BlockExpressionNode
      | undefined;
    if (!blockNode) continue;
    for (const defNode of blockNode.body) {
      if (defNode.name !== "def" || !defNode.args.length) continue;
      const defName = defNode.args[0];
      if (defName.type === NodeType.Bareword) {
        commands.push(`${alias}:${defName.value as string}`);
      } else if (defName.type === NodeType.HelperFunctionExpression) {
        helpers.push(`@${alias}:${(defName as HelperFunctionNode).name}`);
      }
    }
  }

  const seenModules = new Set<string>();

  for (const c of loadNodes) {
    if (!c.args.length) continue;
    // `name>alias` (--from renames) bind under the alias.
    const moduleName: string = String(c.args[0].value ?? "")
      .split(">")
      .pop() as string;
    if (!moduleName || seenModules.has(moduleName)) continue;
    seenModules.add(moduleName);

    const moduleData = moduleCache.getBindingValue(moduleName, MODULE);
    if (moduleData) {
      commands.push(
        ...Object.keys(moduleData.commands).map(
          (name) => `${moduleName}:${name}`,
        ),
      );
      helpers.push(
        ...Object.keys(moduleData.helpers).map(
          (name) => `@${moduleName}:${name}`,
        ),
        ...Object.keys(moduleData.constants ?? {}).map(
          (name) => `@${moduleName}:${name}`,
        ),
      );
    }

    // Unqualified spellings granted by the load line's import list.
    const listNode = c.args[1];
    if (listNode?.type === NodeType.ArrayExpression) {
      const { entries } = parseImportList(listNode as any);
      for (const entry of entries) {
        if (entry.kind === "command") {
          commands.push(entry.boundName);
        } else {
          helpers.push(`@${entry.boundName}`);
        }
      }
    }
  }

  return { commands, helpers };
}
