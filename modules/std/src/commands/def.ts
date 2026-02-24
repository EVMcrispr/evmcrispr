import type {
  Action,
  ArgDef,
  BlockExpressionNode,
  CommandExpressionNode,
  DefValue,
  HelperFunctionNode,
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
import type { Module } from "@evmcrispr/sdk";
import type Std from "..";
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
  const returnType = isHelper ? (returnTypeOrOptDefs as string | undefined) : undefined;
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

    module.bindingsManager.enterScope(name);
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
            run: async (_mod: Module, proxyCall: HelperFunctionNode, ints: NodesInterpreters) => {
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
            `@${def.name}`, proxyDef, DEF, false, undefined, true,
          );
          continue;
        }

        const bindKey = `$${def.name}`;
        if (def.rest) {
          const restValues = [];
          for (let j = i; j < args.length; j++) {
            restValues.push(await interpretNode(args[j]));
          }
          module.bindingsManager.setBinding(bindKey, restValues, USER, false, undefined, true);
        } else if (args[i]) {
          const val = await interpretNode(args[i]);
          module.bindingsManager.setBinding(bindKey, val, USER, false, undefined, true);
        }
      }

      if (!isHelper && "opts" in callNode) {
        const cmdNode = callNode as CommandExpressionNode;
        for (const optDef of optDefs) {
          const opt = cmdNode.opts.find((o) => o.name === optDef.name);
          if (opt) {
            const val = await interpretNode(opt.value);
            module.bindingsManager.setBinding(optDef.name, val, USER, false, undefined, true);
          }
        }
      }

      if (isHelper) {
        return await interpretNode(bodyNode);
      }

      return (await interpretNode(bodyNode as BlockExpressionNode, {
        blockModule: module.contextualName,
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
  description: "Define a user command or helper.",
  args: [
    { name: "name", type: ["command", "helper"] },
    { name: "params", type: "string" },
    { name: "body", type: ["expression", "block"] },
  ],
  async run(module, { name, params, body }, { node }) {
    const { params: paramDefs, opts: optDefs, returnType } = parseSignature(params);
    const isHelper = node.args[0].type === NodeType.HelperFunctionExpression;

    const defValue = isHelper
      ? buildDef("helper", name, paramDefs, returnType, body as Node)
      : buildDef("command", name, paramDefs, optDefs, body as Node);

    module.bindingsManager.setBinding(
      isHelper ? `@${name}` : name,
      defValue,
      DEF,
      false,
      undefined,
      false,
    );
  },
});
