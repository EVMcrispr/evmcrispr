import type { CommandExpressionNode, HelperFunctionNode } from "@evmcrispr/sdk";

import type {
  DeclarationLookup,
  ErrorDeclarationOwner,
} from "../errors/declarations";
import type { ModuleSchemaProvider } from "./moduleSchemas";

/**
 * The static `DeclarationLookup`: the offline twin of the interpreter's
 * `runtimeDeclarationLookup`. It resolves a line's command and helpers
 * against the analyzer's symbol table and module schemas, mirroring the
 * language's precedence (`src/interpreter/resolution.ts`) without touching
 * interpreter code, and reads the normalized `errors` block off the
 * resolved definition.
 *
 * Silent (`undefined`) for everything that declares nothing by
 * construction — a local `def`, a module constant, an on-chain face — and
 * for anything whose schema is unavailable: an unknown name, a module that
 * is not loaded, an opaque external module, a definition that fails to
 * import. Analysis reports those on their own terms (or, for an opaque
 * module, deliberately not at all), and a line whose declarations are
 * unknown must never be treated as a line that declares nothing.
 */

/** A `load` import binding: the module and the export's local name. */
export interface StaticImportRef {
  readonly module: string;
  readonly sourceName: string;
}

/** The script-level names the analyzer collected before checking. */
export interface StaticSymbols {
  readonly importedCommands: ReadonlyMap<string, StaticImportRef>;
  readonly importedHelpers: ReadonlyMap<string, StaticImportRef>;
  readonly defCommands: ReadonlySet<string>;
  readonly defHelpers: ReadonlySet<string>;
}

const label = (module: string, localName: string): string =>
  module === "std" ? localName : `${module}:${localName}`;

export function staticDeclarationLookup(
  schemas: ModuleSchemaProvider,
  symbols: StaticSymbols,
): DeclarationLookup {
  /** Whether a module's definitions can be inspected at all. */
  const readable = (module: string): boolean =>
    schemas.isLoaded(module) && !schemas.isOpaque(module);

  return {
    async command(
      c: CommandExpressionNode,
    ): Promise<ErrorDeclarationOwner | undefined> {
      // Unqualified: def → `load` import (with its rename) → std prelude.
      if (!c.module && symbols.defCommands.has(c.name)) return undefined;
      const imported = c.module
        ? undefined
        : symbols.importedCommands.get(c.name);
      const module = c.module ?? imported?.module ?? "std";
      const localName = imported?.sourceName ?? c.name;
      if (!readable(module)) return undefined;
      const definition = await schemas.getCommand(module, localName);
      if (!definition) return undefined;
      return {
        kind: "command",
        label: label(module, localName),
        errors: definition.errors,
      };
    },

    async helper(
      h: HelperFunctionNode,
    ): Promise<ErrorDeclarationOwner | undefined> {
      // `@name!` is the on-chain face: it compiles into an assertion
      // transaction and has no off-chain channel to raise a refusal.
      if (h.name.endsWith("!")) return undefined;
      if (!h.module && symbols.defHelpers.has(h.name)) return undefined;
      const imported = h.module
        ? undefined
        : symbols.importedHelpers.get(h.name);
      const module = h.module ?? imported?.module ?? "std";
      const localName = imported?.sourceName ?? h.name;
      if (localName.endsWith("!")) return undefined;
      if (!readable(module)) return undefined;
      // A zero-argument name is the module constant when there is one:
      // constants are values, they declare nothing.
      if (h.args.length === 0 && schemas.hasConstant(module, localName)) {
        return undefined;
      }
      const errors = await schemas.getHelperErrors(module, localName);
      if (errors === undefined) return undefined;
      return { kind: "helper", label: `@${label(module, localName)}`, errors };
    },
  };
}
