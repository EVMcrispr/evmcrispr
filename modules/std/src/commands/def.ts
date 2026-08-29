import type {
  Action,
  ArgDef,
  BlockExpressionNode,
  CommandExpressionNode,
  DefValue,
  HelperFunctionNode,
  Module,
  Node,
  NodesInterpreters,
  OptDef,
} from "@evmcrispr/sdk";
import {
  BindingsSpace,
  BreakSignal,
  ContinueSignal,
  defineCommand,
  ErrorException,
  NodeType,
  partitionHelperArgs,
  ReturnSignal,
} from "@evmcrispr/sdk";
import type Std from "..";
import {
  buildEvmlModule,
  checkEvmlModuleName,
  registerEvmlModule,
} from "../utils/evmlModules";
import { inferTypes } from "../utils/inferTypes";
import { parseSignature } from "../utils/parseSignature";

const { USER, DEF } = BindingsSpace;

function buildDef(
  kind: "helper",
  name: string,
  paramDefs: ArgDef[],
  returnTypeOrOptDefs: string | undefined,
  bodyNode: Node,
): DefValue;
function buildDef(
  kind: "command",
  name: string,
  paramDefs: ArgDef[],
  returnTypeOrOptDefs: OptDef[],
  bodyNode: Node,
): DefValue;
function buildDef(
  kind: "command" | "helper",
  name: string,
  paramDefs: ArgDef[],
  returnTypeOrOptDefs: string | undefined | OptDef[],
  bodyNode: Node,
): DefValue {
  const isHelper = kind === "helper";
  const returnType = isHelper
    ? (returnTypeOrOptDefs as string | undefined)
    : undefined;
  const optDefs = isHelper ? [] : (returnTypeOrOptDefs as OptDef[]);

  const run = async (
    module: Module,
    callNode: HelperFunctionNode | CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): Promise<any> => {
    const { interpretNode } = interpreters;

    // Named args (`name:value`) fill their param by name; positional args
    // fill the rest in order. Commands never receive NamedArg nodes, so
    // for them this partition is the identity.
    const { positional, named, issues } = partitionHelperArgs(
      callNode.args,
      paramDefs,
    );
    if (issues.length > 0) {
      throw new ErrorException(`${name}: ${issues[0].message}`);
    }

    const countDefs = paramDefs.filter((p) => !named.has(p.name));
    const requiredCount = countDefs.filter(
      (p) => !p.optional && !p.rest,
    ).length;
    const totalFixed = countDefs.filter((p) => !p.rest).length;
    const hasRest = countDefs.some((p) => p.rest);
    const hasOptional = countDefs.some((p) => p.optional);

    const argCount = positional.length;
    if (hasRest) {
      if (argCount < requiredCount) {
        throw new ErrorException(
          `${name} expects at least ${requiredCount} argument(s), got ${argCount}`,
        );
      }
    } else if (hasOptional) {
      if (argCount < requiredCount || argCount > totalFixed) {
        throw new ErrorException(
          `${name} expects ${requiredCount}-${totalFixed} argument(s), got ${argCount}`,
        );
      }
    } else if (argCount !== requiredCount) {
      throw new ErrorException(
        `${name} expects ${requiredCount} argument(s), got ${argCount}`,
      );
    }

    let cursor = 0;
    const nodeFor = (def: ArgDef): Node | undefined =>
      named.get(def.name)?.value ?? positional[cursor++];

    module.bindingsManager.enterScope();
    try {
      for (let i = 0; i < paramDefs.length; i++) {
        const def = paramDefs[i];

        if (def.type === "helper") {
          const argNode = nodeFor(def);
          if (!argNode || argNode.type !== NodeType.HelperFunctionExpression) {
            throw new ErrorException(
              `@${def.name} must be a helper reference like @helperName`,
            );
          }
          const helperNode = argNode as HelperFunctionNode;
          const proxyDef: DefValue = {
            kind: "helper",
            run: async (
              _mod: Module,
              proxyCall: HelperFunctionNode,
              ints: NodesInterpreters,
            ) => {
              const syntheticCall = {
                ...helperNode,
                args: [...proxyCall.args, ...helperNode.args],
              };
              return await ints.interpretNode(syntheticCall);
            },
            argDefs: [],
            bodyNode: helperNode,
          };
          module.bindingsManager.setBinding(
            `@${def.name}`,
            proxyDef,
            DEF,
            false,
            undefined,
            true,
          );
          continue;
        }

        const bindKey = `$${def.name}`;
        if (def.rest) {
          const restValues = [];
          for (const restNode of positional.slice(cursor)) {
            restValues.push(await interpretNode(restNode));
          }
          cursor = positional.length;
          module.bindingsManager.setBinding(
            bindKey,
            restValues,
            USER,
            false,
            undefined,
            true,
          );
        } else {
          const argNode = nodeFor(def);
          if (argNode) {
            const val = await interpretNode(argNode);
            module.bindingsManager.setBinding(
              bindKey,
              val,
              USER,
              false,
              undefined,
              true,
            );
          }
        }
      }

      if (!isHelper && "opts" in callNode) {
        const cmdNode = callNode as CommandExpressionNode;
        for (const optDef of optDefs) {
          const opt = cmdNode.opts.find((o) => o.name === optDef.name);
          if (opt) {
            const val = await interpretNode(opt.value);
            module.bindingsManager.setBinding(
              optDef.name,
              val,
              USER,
              false,
              undefined,
              true,
            );
          }
        }
      }

      if (isHelper) {
        return await interpretNode(bodyNode);
      }

      try {
        return (await interpretNode(bodyNode as BlockExpressionNode, {
          actionCallback: interpreters.actionCallback,
        })) as Action[];
      } catch (err) {
        // `def return` exits this command body; the signal carries the
        // actions the body produced before it.
        if (err instanceof ReturnSignal) return err.actions as Action[];
        // A def body is a boundary for loop signals: a `loop break` inside
        // the body must not escape into a loop at the call site.
        if (err instanceof BreakSignal || err instanceof ContinueSignal) {
          throw new ErrorException(err.message);
        }
        throw err;
      }
    } finally {
      module.bindingsManager.exitScope();
    }
  };

  return {
    kind,
    run,
    argDefs: paramDefs,
    optDefs,
    returnType,
    bodyNode,
  };
}

export default defineCommand<Std>({
  name: "def",
  description:
    "Define a user command, helper, on-chain helper (`def @name!`), or module (`def module <name> ( ...defs )`), or return early from a command body (`def return`).",
  args: [
    { name: "name", type: ["command", "helper"] },
    {
      name: "params",
      type: "string",
      optional: true,
      description: "Definition expression (see syntax variants below)",
    },
    { name: "body", type: ["expression", "block"], optional: true },
  ],
  async run(module, { name, params, body }, { node, interpreters }) {
    // `def return` — exit the enclosing def command body early. The signal
    // is caught by the command-body runner in `buildDef`.
    if (name === "return" && node.args[0].type === NodeType.Bareword) {
      if (params !== undefined || body !== undefined) {
        throw new ErrorException('"def return" takes no arguments');
      }
      throw new ReturnSignal();
    }

    // `def module <name> ( ...defs )` defines an inline EVML module: its
    // defs become available as `name:cmd` / `@name:helper`, as if the
    // module was loaded.
    if (name === "module") {
      if (
        node.args[1]?.type !== NodeType.Bareword ||
        body?.type !== NodeType.BlockExpression
      ) {
        throw new ErrorException(
          '"module" is reserved — def module <name> ( ...defs ) defines a module',
        );
      }
      checkEvmlModuleName(module, params);
      const instance = await buildEvmlModule(
        module,
        body as BlockExpressionNode,
        params,
        params,
        interpreters,
      );
      registerEvmlModule(module, instance);
      return;
    }

    // `params` and `body` are optional in the arg schema only so the
    // argument-less `def return` form passes the shared arity check —
    // every definition form still requires both.
    if (params === undefined || body === undefined) {
      throw new ErrorException(
        "def expects <name> <params> <body> (or `def return` inside a command body)",
      );
    }

    const {
      params: paramDefs,
      opts: optDefs,
      returnType,
    } = parseSignature(params);
    const isHelper = node.args[0].type === NodeType.HelperFunctionExpression;
    /** A `def @name!` defines an ON-CHAIN helper: its body is made of `!`
     *  helpers, which compile to calldata and have no off-chain face. */
    const isOnchain = isHelper && name.endsWith("!");

    let finalReturnType = returnType;

    const needsInference =
      isHelper && (paramDefs.some((p) => p.type === "any") || !returnType);

    // Type inference walks the body expecting helpers it can reason about
    // off-chain, and an on-chain body is made of compile-only ones. Rather
    // than infer something unreliable, ask for the signature.
    if (isOnchain && needsInference) {
      const missing = paramDefs
        .filter((p) => p.type === "any")
        .map((p) => `$${p.name}`);
      throw new ErrorException(
        `def @${name} needs a fully typed signature${
          missing.length
            ? ` — ${missing.join(", ")} ${missing.length > 1 ? "have" : "has"} no type`
            : ""
        }${!returnType ? `${missing.length ? ", and" : " —"} the return type is missing` : ""}. An on-chain body compiles rather than runs, so its types cannot be inferred from it: write them out, e.g. def @${name} "$x: number -> number" @num!($x * 2)`,
      );
    }

    if (needsInference) {
      const allModules = [module, ...module.context.modules];
      const inferred = inferTypes(body as Node, paramDefs, allModules);

      for (const p of paramDefs) {
        if (p.type === "any") {
          const resolved = inferred.paramTypes.get(p.name);
          if (resolved) p.type = resolved;
        }
      }
      if (!finalReturnType && inferred.returnType) {
        finalReturnType = inferred.returnType;
      }
    }

    const defValue = isHelper
      ? buildDef("helper", name, paramDefs, finalReturnType, body as Node)
      : buildDef("command", name, paramDefs, optDefs, body as Node);
    defValue.node = node;

    if (isOnchain) {
      // No off-chain face. The interpreter refuses a `!` def before it gets
      // this far, so this is the backstop for anything holding the DefValue
      // directly — it should never be the message a script author sees.
      defValue.run = async () => {
        throw new ErrorException(
          `@${name} is defined with a \`!\`, so it compiles into an assertion rather than running at script build time. Define it without the \`!\` to call it here`,
        );
      };
    }

    const bindKey = isHelper ? `@${name}` : name;
    if (module.bindingsManager.hasBinding(bindKey, BindingsSpace.IMPORT)) {
      throw new ErrorException(
        `${bindKey} is already bound by a load import list`,
      );
    }

    module.bindingsManager.setBinding(
      bindKey,
      defValue,
      DEF,
      false,
      undefined,
      false,
    );
  },
});
