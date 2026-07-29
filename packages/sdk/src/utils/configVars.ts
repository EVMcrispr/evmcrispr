import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type { ExecutionOrigin, ModuleData } from "../types";
import { BindingsSpace } from "../types";
import type { Param } from "./encoders";
import type { ConfigDef } from "./schema";

// ---------------------------------------------------------------------------
// Central resolution + access control for module config variables
// (`$<module>:<key>`). Every read/write path — Module.getConfigBinding, the
// interpreter's variable resolution and set's write path — goes through here.
// ---------------------------------------------------------------------------

const CONFIG_VAR_RE = /^\$([a-zA-Z][a-zA-Z-]{0,62}):([a-zA-Z][a-zA-Z0-9]*)$/;

export interface ConfigVarName {
  module: string;
  key: string;
}

/** Parse `$mod:key` into its parts; null for anything else (plain vars,
 *  legacy dotted names, malformed keys). */
export function parseConfigVarName(name: string): ConfigVarName | null {
  const m = name.match(CONFIG_VAR_RE);
  if (!m) return null;
  return { module: m[1], key: m[2] };
}

function getModuleData(
  bindings: BindingsManager,
  module: string,
): ModuleData | undefined {
  return (bindings.getBindingValue(module, BindingsSpace.MODULE) ??
    undefined) as ModuleData | undefined;
}

/** Declared ConfigDef for a module key, if the module is loaded and the key
 *  is declared. */
export function getConfigDef(
  bindings: BindingsManager,
  module: string,
  key: string,
): ConfigDef | undefined {
  return getModuleData(bindings, module)?.configs?.find((c) => c.name === key);
}

/**
 * Assert that `origin` may access `$module:key` in the given mode. Throws
 * with a precise message on: module not loaded, undeclared key, or foreign
 * module access. User-origin code may access any declared config.
 */
export function checkConfigAccess(
  bindings: BindingsManager,
  module: string,
  key: string,
  origin: ExecutionOrigin | undefined,
  mode: "read" | "write",
): ConfigDef {
  const data = getModuleData(bindings, module);
  if (!data) {
    throw new ErrorException(
      `config variable $${module}:${key} references module "${module}", which is not loaded`,
    );
  }
  const def = data.configs?.find((c) => c.name === key);
  if (!def) {
    const declared = (data.configs ?? []).map((c) => c.name);
    const hint = declared.length
      ? ` — declared config variables: ${declared.map((k) => `$${module}:${k}`).join(", ")}`
      : ` — module "${module}" declares no config variables`;
    throw new ErrorException(
      `unknown config variable $${module}:${key}${hint}`,
    );
  }
  if (origin && origin.kind === "module" && origin.module !== module) {
    throw new ErrorException(
      `$${module}:${key} cannot be ${mode === "read" ? "read" : "set"} from module "${origin.module}" — config variables are only accessible to their own module and the user script`,
    );
  }
  return def;
}

/** Substitute `{placeholder}` occurrences in a declared default value.
 *  Throws if a placeholder has no substitution. */
export function substituteConfigDefault(
  template: string,
  module: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, name: string) => {
    const value = vars?.[name];
    if (value === undefined) {
      throw new ErrorException(
        `default of $${module}:${key} needs {${name}}, which is not available here`,
      );
    }
    return String(value);
  });
}

/**
 * Resolve the value of `$module:key`: the USER binding if set, otherwise the
 * declared default (with `{chainId}`-style placeholders substituted from
 * `vars`). Returns undefined when unset and no default is declared.
 * Does NOT perform access control — pair with checkConfigAccess.
 */
export function readConfigValue(
  bindings: BindingsManager,
  module: string,
  key: string,
  vars?: Record<string, string | number>,
): Param | undefined {
  const set = bindings.getBindingValue(`$${module}:${key}`, BindingsSpace.USER);
  if (set !== undefined && set !== null) return set;
  const def = getConfigDef(bindings, module, key);
  if (def?.default === undefined) return undefined;
  return substituteConfigDefault(def.default, module, key, vars);
}
