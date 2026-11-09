import type {
  BlockExpressionNode,
  CommandExpressionNode,
  Commands,
  HelperFunctions,
  IModuleConstructor,
  Node,
} from "@evmcrispr/sdk";
import { NodeType, resolveCommand, resolveHelper } from "@evmcrispr/sdk";

import { isLoadCommand, lineHelpers } from "../astWalk";

type Loader = () => Promise<unknown>;

/** What a script will need: the modules it loads and the command and
 *  helper names it uses, blocks included. */
export interface ScriptNeeds {
  modules: Set<string>;
  commands: Set<string>;
  helpers: Set<string>;
}

export function scriptNeeds(
  body: readonly CommandExpressionNode[],
): ScriptNeeds {
  const needs: ScriptNeeds = {
    modules: new Set(),
    commands: new Set(),
    helpers: new Set(),
  };
  const blocks = (node: Node, out: BlockExpressionNode[]) => {
    if (node.type === NodeType.BlockExpression) {
      out.push(node as BlockExpressionNode);
    }
  };
  const walk = (commands: readonly CommandExpressionNode[]) => {
    for (const c of commands) {
      needs.commands.add(c.name);
      // `load <name>`, but not `--from`: that binds a module the script
      // itself provides, not one of the registry's.
      if (
        isLoadCommand(c) &&
        typeof c.args[0]?.value === "string" &&
        !c.opts?.some((o) => o.name === "from")
      ) {
        needs.modules.add(c.args[0].value);
      }
      for (const h of lineHelpers(c)) needs.helpers.add(h.name);
      const inner: BlockExpressionNode[] = [];
      for (const a of c.args) blocks(a, inner);
      for (const o of c.opts ?? []) blocks(o.value, inner);
      for (const b of inner) walk(b.body);
    }
  };
  walk(body);
  return needs;
}

/**
 * Starts fetching, all at once, the code a script will need: every
 * registered module it loads, and each command and helper it names, from
 * std and from those modules. Nothing waits for it and nothing it does is
 * an error: the run still loads each piece where it always did, and finds
 * it already fetched or on its way. Without this, a browser fetched each
 * chunk only when the run reached it, one after another.
 */
export function prefetchScript(
  needs: ScriptNeeds,
  input: {
    /** Std's maps, as an instance holds them: an entry may be a loader or
     *  an already defined command or helper (then there is nothing to do). */
    std: { commands: Commands; helpers: HelperFunctions };
    moduleLoader: (name: string) => Loader | undefined;
  },
): void {
  const quietly = (fetching: Promise<unknown>) => {
    void fetching.catch(() => undefined);
  };
  const command = (entry: Commands[string] | undefined) => {
    if (entry) quietly(resolveCommand(entry));
  };
  const helper = (entry: HelperFunctions[string] | undefined) => {
    if (entry) quietly(resolveHelper(entry));
  };
  const loader = (entry: Loader | undefined) => {
    if (typeof entry === "function") quietly(entry());
  };
  for (const name of needs.commands) command(input.std.commands[name]);
  for (const name of needs.helpers) helper(input.std.helpers[name]);
  for (const moduleName of needs.modules) {
    const load = input.moduleLoader(moduleName);
    if (!load) continue;
    quietly(
      load().then((mod) => {
        const ctor = (mod as { default?: IModuleConstructor }).default;
        for (const name of needs.commands) loader(ctor?.commandLoaders?.[name]);
        for (const name of needs.helpers) loader(ctor?.helperLoaders?.[name]);
      }),
    );
  }
}
