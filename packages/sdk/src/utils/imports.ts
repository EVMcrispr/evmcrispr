import type { ArrayExpressionNode, Node } from "../types";
import { NodeType } from "../types";

/** One parsed entry of a `load` import list, before checking it against the
 *  module's actual exports. */
export type ImportListEntry = {
  kind: "command" | "helper";
  /** Local export name on the module. */
  sourceName: string;
  /** Name bound in the script (after an optional `>` rename). */
  boundName: string;
  /** The list element, for diagnostics locations. */
  node: Node;
};

export type ImportListError = {
  node: Node;
  message: string;
};

const COMMAND_IMPORT_NAME = /^[a-zA-Z-]{1,63}(?<!-)$/;

/**
 * Validate the shape of a `load` import list and extract its entries.
 *
 * Accepted elements (must be literals — the list is resolved statically):
 * - `name` / `name>newName` — a command import (parsed as one bareword,
 *   since `>` is a valid bareword character)
 * - `@name` / `@name>@newName` — a helper or constant import (the parser
 *   stores the rename target on the node's `rename` field)
 *
 * Export existence and collision checks belong to the caller — this only
 * validates shape and name charsets.
 */
export function parseImportList(list: ArrayExpressionNode): {
  entries: ImportListEntry[];
  errors: ImportListError[];
} {
  const entries: ImportListEntry[] = [];
  const errors: ImportListError[] = [];

  for (const el of list.elements) {
    if (el.type === NodeType.Bareword) {
      const parts = (el.value as string).split(">");
      if (parts.length > 2 || parts.some((p) => !p.length)) {
        errors.push({
          node: el,
          message: `invalid import entry "${el.value}" — expected name or name>newName`,
        });
        continue;
      }
      const bad = parts.find((p) => !COMMAND_IMPORT_NAME.test(p));
      if (bad !== undefined) {
        errors.push({
          node: el,
          message: `invalid command name "${bad}" in import list (letters and dashes only)`,
        });
        continue;
      }
      entries.push({
        kind: "command",
        sourceName: parts[0],
        boundName: parts[1] ?? parts[0],
        node: el,
      });
    } else if (el.type === NodeType.HelperFunctionExpression) {
      const h = el as Node & {
        module?: string;
        name: string;
        rename?: string;
        args: Node[];
      };
      if (h.module) {
        errors.push({
          node: el,
          message: `import entries take local names — write @${h.name}, not @${h.module}:${h.name}`,
        });
        continue;
      }
      if (h.args.length > 0) {
        errors.push({
          node: el,
          message: `import entry @${h.name} must not have arguments`,
        });
        continue;
      }
      entries.push({
        kind: "helper",
        sourceName: h.name,
        boundName: h.rename ?? h.name,
        node: el,
      });
    } else if (el.type === NodeType.NamedArg) {
      errors.push({
        node: el,
        message: `import lists take names, not name:value entries — write ${(el as Node & { name: string }).name}, or name>newName to rename`,
      });
    } else {
      errors.push({
        node: el,
        message:
          "import list entries must be literal command names or @helper names",
      });
    }
  }

  return { entries, errors };
}
