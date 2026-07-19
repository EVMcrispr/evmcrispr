import { Module } from "./Module";
import type {
  Commands,
  DefValue,
  ExecutionOrigin,
  HelperArgDefEntry,
  HelperFunctions,
  ICommand,
  ModuleContext,
  NodesInterpreters,
} from "./types";
import { BindingsSpace } from "./types";
import type { ArgType } from "./utils/schema";

/**
 * A module defined in EVML itself — either inline via the `module` command
 * or fetched by `load <alias> --from ipfs://...`. Built from the `def`
 * values collected out of the module block.
 *
 * `name` is the local alias the importer chose; `canonicalName` is the name
 * declared in the `module <name> (...)` block, kept for diagnostics and as
 * the execution origin of the module's def bodies.
 *
 * Def keys follow the DEF-space convention: bare `name` for commands,
 * `@name` for helpers.
 */
export class EvmlModule extends Module {
  readonly canonicalName: string;

  constructor(
    alias: string,
    canonicalName: string,
    defs: Map<string, DefValue>,
    context: ModuleContext,
  ) {
    const origin: ExecutionOrigin = { kind: "module", module: canonicalName };

    /** Run a def with the module's sibling defs bound scope-locally (so
     *  unqualified sibling names resolve, shadowing the caller's) and the
     *  module execution origin propagated into every nested interpretation. */
    const wrapRun =
      (def: DefValue) =>
      async (
        module: Module,
        node: any,
        interpreters: NodesInterpreters,
      ): Promise<any> => {
        const bm = module.bindingsManager;
        bm.enterScope();
        try {
          for (const [key, sibling] of defs) {
            bm.setBinding(
              key,
              sibling,
              BindingsSpace.DEF,
              false,
              undefined,
              true,
            );
          }
          return await def.run(module, node, withOrigin(interpreters, origin));
        } finally {
          bm.exitScope();
        }
      };

    const commands: Commands<any> = {};
    const helpers: HelperFunctions<any> = {};
    const helperReturnTypes: Record<string, ArgType> = {};
    const helperHasArgs: Record<string, boolean> = {};
    const helperArgDefs: Record<string, HelperArgDefEntry[]> = {};

    for (const [key, def] of defs) {
      if (def.kind === "command") {
        const command: ICommand = {
          run: wrapRun(def),
          argDefs: def.argDefs,
          optDefs: def.optDefs ?? [],
        };
        commands[key] = command;
      } else {
        const run = wrapRun(def);
        const helperName = key.slice(1); // strip leading @
        // NOTE: resolveHelper distinguishes lazy loaders from helper fns by
        // arity — this wrapper must declare all three parameters.
        helpers[helperName] = (module, node, interpreters) =>
          run(module, node, interpreters);
        if (def.returnType) helperReturnTypes[helperName] = def.returnType;
        helperHasArgs[helperName] = def.argDefs.length > 0;
        helperArgDefs[helperName] = def.argDefs.map((a) => ({
          name: a.name,
          type: a.type,
          ...(a.optional ? { optional: true } : {}),
          ...(a.rest ? { rest: true } : {}),
          ...(a.description ? { description: a.description } : {}),
        }));
      }
    }

    super(
      alias,
      commands,
      helpers,
      helperReturnTypes,
      helperHasArgs,
      helperArgDefs,
      {},
      {},
      {},
      {},
      context,
    );
    this.canonicalName = canonicalName;
  }
}

/** Wrap interpreters so `origin` propagates into every nested
 *  `interpretNode`/`interpretNodes` call of a module def body. Explicit
 *  per-call options keep precedence for other fields. */
function withOrigin(
  interpreters: NodesInterpreters,
  origin: ExecutionOrigin,
): NodesInterpreters {
  return {
    ...interpreters,
    origin,
    interpretNode: (n, options) =>
      interpreters.interpretNode(n, { origin, ...options }),
    interpretNodes: (nodes, sequentally, options) =>
      interpreters.interpretNodes(nodes, sequentally, { origin, ...options }),
  };
}
