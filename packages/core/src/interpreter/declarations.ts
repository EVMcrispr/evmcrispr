import type {
  CommandExpressionNode,
  HelperFunctionNode,
  Module,
} from "@evmcrispr/sdk";
import { resolveCommand, resolveHelper } from "@evmcrispr/sdk";

import type {
  DeclarationLookup,
  ErrorDeclarationOwner,
} from "../errors/declarations";
import {
  locateCommand,
  locateHelper,
  type ResolutionInput,
} from "./resolution";

/**
 * The execution-mode `DeclarationLookup`: resolves a line's command and
 * helpers against the live module instances and bindings, with exactly the
 * precedence execution applies (`locateHelper` / `locateCommand`), and
 * reads the normalized `errors` block off the resolved definition.
 *
 * Silent (`undefined`) for what declares nothing by construction — a local
 * `def`, a constant, an on-chain-only face — and for a name that does not
 * resolve; execution reports those with their own location. A definition
 * that fails to import is not silenced: the loader's error propagates.
 */
export function runtimeDeclarationLookup(
  input: ResolutionInput,
): DeclarationLookup {
  const label = (m: Module, localName: string): string =>
    m.name === "std" ? localName : `${m.name}:${localName}`;

  return {
    async command(
      c: CommandExpressionNode,
    ): Promise<ErrorDeclarationOwner | undefined> {
      const target = locateCommand(c, input);
      if (target.kind !== "module") return undefined;
      const { module, localName } = target;
      const definition = await resolveCommand(module.commands[localName]);
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
      const target = locateHelper(h, input);
      if (target.kind !== "module") return undefined;
      const { module, localName } = target;
      if (module.helperOnchain[localName]) return undefined;
      const definition = await resolveHelper(module.helpers[localName]);
      return {
        kind: "helper",
        label: `@${label(module, localName)}`,
        errors: definition.errors,
      };
    },
  };
}
