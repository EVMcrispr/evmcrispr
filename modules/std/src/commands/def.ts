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
  defineCommand,
  ErrorException,
  NodeType,
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

  const requiredCount = paramDefs.filter((p) => !p.optional && !p.rest).length;
  const totalFixed = paramDefs.filter((p) => !p.rest).length;
  const hasRest = paramDefs.some((p) => p.rest);
  const hasOptional = paramDefs.some((p) => p.optional);

  const run = async (
    module: Module,
    callNode: HelperFunctionNode | CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): Promise<any> => {
    const { interpretNode } = interpreters;
    const args = callNode.args;

    const argCount = args.length;
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

    module.bindingsManager.enterScope();
    try {
      for (let i = 0; i < paramDefs.length; i++) {
        const def = paramDefs[i];

        if (def.type === "helper") {
          const argNode = args[i];
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
          for (let j = i; j < args.length; j++) {
            restValues.push(await interpretNode(args[j]));
          }
          module.bindingsManager.setBinding(
            bindKey,
            restValues,
            USER,
            false,
            undefined,
            true,
          );
        } else if (args[i]) {
          const val = await interpretNode(args[i]);
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

      return (await interpretNode(bodyNode as BlockExpressionNode, {
        actionCallback: interpreters.actionCallback,
      })) as Action[];
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
    "Define a user command, helper, or module (`def module <name> ( ...defs )`).",
  args: [
    { name: "name", type: ["command", "helper"] },
    {
      name: "params",
      type: "string",
      description: "Definition expression (see syntax variants below)",
    },
    { name: "body", type: ["expression", "block"] },
  ],
  async run(module, { name, params, body }, { node, interpreters }) {
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

    const {
      params: paramDefs,
      opts: optDefs,
      returnType,
    } = parseSignature(params);
    const isHelper = node.args[0].type === NodeType.HelperFunctionExpression;

    let finalReturnType = returnType;

    const needsInference =
      isHelper && (paramDefs.some((p) => p.type === "any") || !returnType);

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
