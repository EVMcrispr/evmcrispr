import type { PublicClient } from "viem";

import type { BindingsManager } from "../BindingsManager";
import type { CommandExpressionNode, Node, Position } from "./ast";

export type CompletionItemKind = "command" | "helper" | "variable" | "field";

export type CompletionItem = {
  label: string;
  insertText: string;
  kind: CompletionItemKind;
  sortPriority?: number;
  /** For helper items: the declared return type, used for filtering. */
  returnType?: string;
  /** When true, insertText uses Monaco snippet syntax (e.g. $0 for cursor). */
  isSnippet?: boolean;
};

export interface CompletionContext {
  argIndex: number;
  nodeArgs: Node[];
  bindings: BindingsManager;
  position: Position;
  client: PublicClient;
  /** Chain ID of the current client, precomputed for synchronous lookups. */
  chainId: number;
  /** Persistent cache for fetched data (ABIs, DAOs, etc.) */
  cache: BindingsManager;
  /** The full command AST node (for accessing opts like --as). */
  commandNode?: CommandExpressionNode;
}

export type ArgCompletionFn = (
  ctx: CompletionContext,
) => Promise<CompletionItem[]> | CompletionItem[];

export type CompletionOverrides = Record<string, ArgCompletionFn>;

/** Callback that executes a helper with pre-resolved arguments and returns its result. */
export type HelperResolver = (
  helperName: string,
  resolvedArgs: string[],
  chainId: number,
  client: PublicClient,
  bindings: BindingsManager,
) => Promise<string>;
