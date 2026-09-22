import type {
  Abi,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionItem,
  DeclaredErrorEntry,
  HelperFunctionNode,
  NormalizedDeclaredErrors,
} from "@evmcrispr/sdk";
import {
  abiBindingKey,
  type BindingsManager,
  BindingsSpace,
  declaredErrorAbi,
  errorAbiFromSignature,
  errorSelector,
  errorSignature,
  indexDeclaredErrors,
  NodeType,
  parseImportList,
} from "@evmcrispr/sdk";
import { isAddress } from "viem";

import {
  type StaticImportRef,
  type StaticSymbols,
  staticDeclarationLookup,
} from "../analysis/declarations";
import { ModuleSchemaProvider } from "../analysis/moduleSchemas";
import { isLoadCommand } from "../astWalk";
import type { DeclarationLookup } from "./declarations";

/**
 * The declared errors an editor feature shows: completions after an error
 * arrow and the hover cards for commands, helpers and capture names.
 *
 * Strictly offline. Declarations come from the same static lookup the
 * analyzer uses (`analysis/declarations.ts`), which resolves definitions
 * through local dynamic imports; a contract's custom errors are only ever
 * read from an ABI the editor already cached. Nothing here fetches.
 */

/** The ABI error item a declaration or a contract entry carries. */
type ErrorAbi = DeclaredErrorEntry["abi"];

/** Solidity's built-ins, always capturable. The parameter names are the
 *  ones the language docs use, so the destructure template reads well;
 *  a selector only depends on the types, so these stay the builtins. */
const BUILTIN_ERRORS: readonly { abi: ErrorAbi; description: string }[] = [
  {
    abi: errorAbiFromSignature("Error", ["string reason"]),
    description: "The reason string of a failed `require` / `revert`.",
  },
  {
    abi: errorAbiFromSignature("Panic", ["uint256 code"]),
    description: "Solidity's panic code (overflow, division by zero, …).",
  },
];

// ---------------------------------------------------------------------------
// Static symbols and the declaration lookup
// ---------------------------------------------------------------------------

/** Split a load target `name` / `name>alias` into the name it binds to. */
function loadedAs(raw: string): string | undefined {
  const parts = raw.split(">");
  if (parts.length > 2 || parts.some((p) => !p.length)) return undefined;
  return parts[1] ?? parts[0];
}

/**
 * The script-level names the declaration lookup needs: what `load` import
 * lists bind (with their `>` renames) and what `def` defines. Mirrors the
 * analyzer's first pass, minus everything only diagnostics need.
 */
export function collectStaticSymbols(
  body: readonly CommandExpressionNode[],
): StaticSymbols {
  const symbols = {
    importedCommands: new Map<string, StaticImportRef>(),
    importedHelpers: new Map<string, StaticImportRef>(),
    defCommands: new Set<string>(),
    defHelpers: new Set<string>(),
  };

  const visit = (commands: readonly CommandExpressionNode[]): void => {
    for (const c of commands) {
      const isDef = (c.module ?? "std") === "std" && c.name === "def";
      if (isDef) {
        const nameNode = c.args[0];
        if (nameNode?.type === NodeType.Bareword) {
          symbols.defCommands.add(nameNode.value as string);
        } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
          symbols.defHelpers.add((nameNode as HelperFunctionNode).name);
        }
        continue; // a def body is its own scope
      }

      if (isLoadCommand(c)) {
        const rawTarget = c.args[0]?.value as string | undefined;
        const moduleName = rawTarget ? loadedAs(rawTarget) : undefined;
        const listNode = c.args[1];
        if (moduleName && listNode?.type === NodeType.ArrayExpression) {
          const { entries } = parseImportList(listNode as never);
          for (const entry of entries) {
            const ref: StaticImportRef = {
              module: moduleName,
              sourceName: entry.sourceName,
            };
            if (entry.kind === "command") {
              symbols.importedCommands.set(entry.boundName, ref);
            } else {
              symbols.importedHelpers.set(entry.boundName, ref);
            }
          }
        }
      }

      for (const arg of c.args) {
        if (arg.type === NodeType.BlockExpression) {
          visit((arg as BlockExpressionNode).body);
        }
      }
    }
  };

  visit(body);
  return symbols;
}

/** Everything an editor feature needs to read declared errors offline. */
export interface EditorErrorContext {
  /** Module schemas, resolved through local imports and memoized. */
  readonly schemas: ModuleSchemaProvider;
  /** The line-level command/helper declaration lookup. */
  readonly lookup: DeclarationLookup;
}

/** A schema provider over the editor's module cache. Registered-but-unloaded
 *  module names only drive diagnostics, so it needs none of them. */
export function editorSchemas(moduleCache: BindingsManager) {
  return new ModuleSchemaProvider(moduleCache, []);
}

export function editorErrorContext(
  body: readonly CommandExpressionNode[],
  moduleCache: BindingsManager,
): EditorErrorContext {
  const schemas = editorSchemas(moduleCache);
  return {
    schemas,
    lookup: staticDeclarationLookup(schemas, collectStaticSymbols(body)),
  };
}

// ---------------------------------------------------------------------------
// Capture-name position (completions)
// ---------------------------------------------------------------------------

const ARROWS = ["-?!>", "-!>"] as const;

export interface CaptureNamePosition {
  /** Column of the `-` starting the clause the cursor is typing into. */
  readonly arrowStart: number;
}

/**
 * Whether the cursor sits where an error name goes: right after a `-!>` /
 * `-?!>` on this line, with at most a partial name typed since.
 *
 * Text-based on purpose — the line does not parse while the name is still
 * missing — but not naive: strings are skipped whole (so an arrow inside a
 * quoted value never counts, and an unterminated string swallows the rest
 * of the line), and a `#` ends the scan because it opens a comment. The
 * caller confirms the rest by parsing the text before the arrow as a
 * command.
 */
export function findCaptureNamePosition(
  line: string,
  col: number,
): CaptureNamePosition | undefined {
  const text = line.slice(0, col);
  let arrowStart: number | undefined;
  let arrowEnd = 0;
  // Inside the head of an event capture (`-> Name(types)?#N? [slots]`) —
  // the one place a `#` is not a comment.
  let eventHead = false;

  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
      eventHead = false;
      continue;
    }
    // A bareword stops at `#` (`parsers/primaries/identifiers.ts`) and
    // `commentParser` opens there, so a `#` is a comment wherever it
    // appears — except the occurrence selector of an event capture, which
    // the grammar spells as `#<digits>` glued to the event name it follows
    // (`parsers/capture.ts`). Anything else ends the scan, including a
    // comment whose text happens to start with a digit.
    if (ch === "#") {
      const isOccurrence =
        eventHead &&
        i > 0 &&
        !/\s/.test(text[i - 1]) &&
        /[0-9]/.test(text[i + 1] ?? "");
      if (!isOccurrence) return undefined;
      eventHead = false;
      i++;
      continue;
    }
    const arrow = ARROWS.find((a) => text.startsWith(a, i));
    if (arrow) {
      arrowStart = i;
      i += arrow.length;
      arrowEnd = i;
      eventHead = false;
      continue;
    }
    // `->` opens an event capture; its head ends at the destructure.
    if (text.startsWith("->", i)) {
      eventHead = true;
      i += 2;
      continue;
    }
    if (ch === "[") eventHead = false;
    i++;
  }

  if (arrowStart === undefined) return undefined;
  // Whitespace, then at most the name being typed. Anything else (a
  // destructure, a bool var, a finished name) is not a name position.
  if (!/^[ \t]+([A-Za-z_][A-Za-z0-9_]*)?$/.test(text.slice(arrowEnd))) {
    return undefined;
  }
  return { arrowStart };
}

// ---------------------------------------------------------------------------
// Cached contract errors
// ---------------------------------------------------------------------------

/**
 * The ABI the editor already holds for the line's target contract, or
 * `undefined`. The target is the first argument that is locally known: an
 * address literal, or a variable the walk already bound to an address.
 * Helpers are never evaluated and no ABI is ever fetched — a capture UI
 * must not put the editor on the network.
 */
export function cachedTargetAbi(
  c: CommandExpressionNode,
  bindings: BindingsManager,
  moduleCache: BindingsManager,
  chainId: number,
): Abi | undefined {
  const { ABI, USER } = BindingsSpace;
  for (const arg of c.args) {
    let address: string | undefined;
    if (arg.type === NodeType.AddressLiteral) {
      address = arg.value as string;
    } else if (arg.type === NodeType.VariableIdentifier) {
      const bound = bindings.getBindingValue(arg.value as string, USER);
      if (typeof bound === "string") address = bound;
    }
    if (!address || !isAddress(address)) continue;
    const key = abiBindingKey(chainId, address);
    const abi =
      bindings.getBindingValue(key, ABI) ??
      moduleCache.getBindingValue(key, ABI);
    if (abi) return abi;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Completion items
// ---------------------------------------------------------------------------

/** A field's capture name: its ABI parameter name, or a positional stand-in
 *  when the contract's ABI leaves it unnamed. */
const fieldName = (input: { name?: string }, index: number): string =>
  input.name || `arg${index + 1}`;

/** `[$field …]` for an error with fields, empty for a fieldless one. */
function destructureTemplate(abi: ErrorAbi): string {
  if (abi.inputs.length === 0) return "";
  const slots = abi.inputs.map((input, i) => `$${fieldName(input, i)}`);
  return ` [${slots.join(" ")}]`;
}

/**
 * What a script may capture on this line, in the order it is offered: the
 * command's declarations, then the reachable helpers', then Solidity's
 * builtins, then the cached contract's own custom errors. Identical
 * signatures collapse (first wins); a bare name several declarations share
 * is offered as each of its explicit signatures instead.
 */
export function errorCaptureCompletionItems(
  declared: readonly DeclaredErrorEntry[],
  abi: Abi | undefined,
): CompletionItem[] {
  const index = indexDeclaredErrors(declared);
  const items: CompletionItem[] = [];
  const seen = new Set<string>();

  const push = (
    errorAbi: ErrorAbi,
    opts: {
      explicit: boolean;
      sortPriority: number;
      documentation?: string;
    },
  ): void => {
    const selector = errorSelector(errorAbi);
    if (seen.has(selector)) return;
    seen.add(selector);
    const signature = errorSignature(errorAbi);
    const label = opts.explicit ? signature : errorAbi.name;
    items.push({
      label,
      insertText: `${label}${destructureTemplate(errorAbi)}`,
      kind: "field",
      sortPriority: opts.sortPriority,
      detail: signature,
      ...(opts.documentation ? { documentation: opts.documentation } : {}),
    });
  };

  for (const entry of index.entries) {
    const ambiguous = (index.byName.get(entry.name)?.length ?? 0) > 1;
    push(entry.abi, {
      explicit: ambiguous,
      sortPriority: entry.ownerKind === "command" ? 0 : 1,
      documentation: `${entry.description}\n\nDeclared by ${entry.ownerKind} \`${entry.ownerLabel}\`.`,
    });
  }

  for (const builtin of BUILTIN_ERRORS) {
    push(builtin.abi, {
      explicit: true,
      sortPriority: 2,
      documentation: builtin.description,
    });
  }

  for (const item of abi ?? []) {
    if (item.type !== "error") continue;
    push(item, { explicit: true, sortPriority: 3 });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Hover cards
// ---------------------------------------------------------------------------

/** The `**Errors**` section of a command or helper card, or `undefined`
 *  when the definition declares nothing. */
export function formatDeclaredErrorsSection(
  errors: NormalizedDeclaredErrors | undefined,
): string | undefined {
  const names = Object.keys(errors ?? {});
  if (!errors || names.length === 0) return undefined;
  const lines = names.map(
    (name) =>
      `- \`${errorSignature(declaredErrorAbi(name, errors[name]))}\` — ${errors[name].description}`,
  );
  return `**Errors**\n\n${lines.join("\n")}`;
}

/** The card for one declared error captured on a line: its signature, the
 *  definition that declares it, the description and a field table. */
export function formatDeclaredErrorCard(entry: DeclaredErrorEntry): string {
  const sections = [
    `**Error** \`${errorSignature(entry.abi)}\` declared by ${entry.ownerKind} \`${entry.ownerLabel}\``,
    entry.description,
  ];
  if (entry.abi.inputs.length > 0) {
    const rows = entry.abi.inputs.map(
      (input, i) => `| \`${fieldName(input, i)}\` | \`${input.type}\` |`,
    );
    sections.push(["| field | type |", "| --- | --- |", ...rows].join("\n"));
  }
  return sections.join("\n\n");
}

/**
 * Every declaration of `errorName` on this line, identical signatures
 * collapsed. More than one means the bare name is ambiguous — the cards
 * then show each signature, which is what the script must spell out.
 */
export function declarationsNamed(
  declared: readonly DeclaredErrorEntry[],
  errorName: string,
): readonly DeclaredErrorEntry[] {
  return indexDeclaredErrors(declared).byName.get(errorName) ?? [];
}
