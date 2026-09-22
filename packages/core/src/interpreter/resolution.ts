import type {
  BindingsManager,
  CommandExpressionNode,
  DefValue,
  HelperFunctionNode,
  ImportValue,
  Module,
} from "@evmcrispr/sdk";
import { BindingsSpace } from "@evmcrispr/sdk";

/**
 * Name resolution for execution mode: which definition a command or helper
 * node names, following the language's precedence. Qualified names
 * (`mod:cmd`, `@mod:helper`, explicit `std:`) are strict. Unqualified names
 * resolve def → `load` import (with its rename) → std prelude. Resolution
 * never throws: an unresolvable name is reported as `missing` with the
 * message the interpreter raises, so metadata collectors can decide to
 * stay silent while execution reports it.
 */

export interface ResolutionInput {
  bindings: BindingsManager;
  std: () => Module;
  /** User-loaded modules (excluding std). */
  modules: () => Module[];
}

type DefHelperValue = Extract<DefValue, { kind: "helper" }>;
type DefCommandValue = Extract<DefValue, { kind: "command" }>;

export type HelperTarget =
  | { kind: "def"; def: DefHelperValue }
  | { kind: "constant"; value: string }
  | { kind: "module"; module: Module; localName: string }
  | { kind: "missing"; message: string };

export type CommandTarget =
  | { kind: "def"; def: DefCommandValue }
  | { kind: "module"; module: Module; localName: string }
  | { kind: "missing"; message: string };

function findModule(input: ResolutionInput, name: string): Module | undefined {
  return name === "std"
    ? input.std()
    : input.modules().find((m) => m.name === name);
}

/** A module's helper or constant by local name. Constants only apply to
 *  zero-argument invocations. */
function helperOnModule(
  m: Module,
  h: HelperFunctionNode,
  localName: string,
): HelperTarget {
  if (h.args.length === 0 && m.constants[localName] !== undefined) {
    return { kind: "constant", value: m.constants[localName] };
  }
  if (!m.helpers[localName]) {
    return {
      kind: "missing",
      message: `module ${m.name} has no helper${h.args.length === 0 ? " or constant" : ""} named ${localName}`,
    };
  }
  return { kind: "module", module: m, localName };
}

export function locateHelper(
  h: HelperFunctionNode,
  input: ResolutionInput,
): HelperTarget {
  // Qualified: @mod:name — strict, no fallback.
  if (h.module) {
    const m = findModule(input, h.module);
    if (!m)
      return { kind: "missing", message: `module ${h.module} not loaded` };
    return helperOnModule(m, h, h.name);
  }

  // Unqualified: def → import → std prelude.
  const def = input.bindings.getBindingValue(`@${h.name}`, BindingsSpace.DEF) as
    | DefValue
    | undefined;
  if (def && def.kind === "helper") return { kind: "def", def };

  const imported = input.bindings.getBindingValue(
    `@${h.name}`,
    BindingsSpace.IMPORT,
  ) as ImportValue | undefined;
  if (imported) {
    const m = findModule(input, imported.module);
    if (!m) {
      return {
        kind: "missing",
        message: `module ${imported.module} not loaded`,
      };
    }
    return helperOnModule(m, h, imported.name);
  }

  const std = input.std();
  if (h.args.length === 0 && std.constants[h.name] !== undefined) {
    return { kind: "constant", value: std.constants[h.name] };
  }
  if (std.helpers[h.name]) {
    return { kind: "module", module: std, localName: h.name };
  }
  return {
    kind: "missing",
    message: `helper @${h.name} not found — qualify it as @<module>:${h.name} or add it to the module's load import list`,
  };
}

export function locateCommand(
  c: CommandExpressionNode,
  input: ResolutionInput,
): CommandTarget {
  if (!c.module) {
    const def = input.bindings.getBindingValue(c.name, BindingsSpace.DEF) as
      | DefValue
      | undefined;
    if (def && def.kind === "command") return { kind: "def", def };
  }

  if (c.module) {
    // Qualified: mod:cmd — strict, no std fallback.
    const m = findModule(input, c.module);
    if (!m)
      return { kind: "missing", message: `module ${c.module} not loaded` };
    if (!m.commands[c.name]) {
      return {
        kind: "missing",
        message: `module ${m.name} has no command named ${c.name}`,
      };
    }
    return { kind: "module", module: m, localName: c.name };
  }

  // Unqualified: import → std prelude (defs were handled above).
  const imported = input.bindings.getBindingValue(
    c.name,
    BindingsSpace.IMPORT,
  ) as ImportValue | undefined;
  if (imported?.kind === "command") {
    const m = findModule(input, imported.module);
    if (!m) {
      return {
        kind: "missing",
        message: `module ${imported.module} not loaded`,
      };
    }
    return { kind: "module", module: m, localName: imported.name };
  }

  const std = input.std();
  if (std.commands[c.name]) {
    return { kind: "module", module: std, localName: c.name };
  }
  return {
    kind: "missing",
    message: `command ${c.name} not found — qualify it as <module>:${c.name} or add it to the module's load import list`,
  };
}
