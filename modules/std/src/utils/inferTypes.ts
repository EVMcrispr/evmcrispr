import type {
  ArgDef,
  DefValue,
  HelperArgDefEntry,
  HelperFunctionNode,
  Node,
} from "@evmcrispr/sdk";
import { BindingsSpace, NodeType } from "@evmcrispr/sdk";
import type { Module } from "@evmcrispr/sdk";

export interface InferResult {
  paramTypes: Map<string, string>;
  returnType: string | undefined;
}

interface HelperMeta {
  argDefs: HelperArgDefEntry[];
  returnType: string | string[] | undefined;
}

function lookupHelper(
  name: string,
  allModules: Module[],
): HelperMeta | undefined {
  for (const m of allModules) {
    if (m.helperArgDefs[name]) {
      return {
        argDefs: m.helperArgDefs[name],
        returnType: m.helperReturnTypes[name],
      };
    }
  }

  const bm = allModules[0]?.bindingsManager;
  if (bm) {
    const defVal = bm.getBindingValue(
      `@${name}`,
      BindingsSpace.DEF,
    ) as DefValue | undefined;
    if (defVal?.kind === "helper") {
      return {
        argDefs: defVal.argDefs as HelperArgDefEntry[],
        returnType: defVal.returnType as string | undefined,
      };
    }
  }

  return undefined;
}

function resolveArgType(
  meta: HelperMeta,
  argIndex: number,
): string | undefined {
  const fixedDefs = meta.argDefs.filter((d) => !d.rest);
  const restDef = meta.argDefs.find((d) => d.rest);

  if (argIndex < fixedDefs.length) {
    const t = fixedDefs[argIndex].type;
    return Array.isArray(t) ? t[0] : t;
  }
  if (restDef) {
    const t = restDef.type;
    return Array.isArray(t) ? t[0] : t;
  }
  return undefined;
}

function normalizeReturnType(
  rt: string | string[] | undefined,
): string | undefined {
  if (!rt) return undefined;
  return Array.isArray(rt) ? rt[0] : rt;
}

/**
 * Walk the body AST of a `def` helper and infer:
 * - parameter types (for params declared as `"any"`)
 * - return type (from the outermost expression)
 */
export function inferTypes(
  bodyNode: Node,
  paramDefs: ArgDef[],
  allModules: Module[],
): InferResult {
  const untypedNames = new Set(
    paramDefs.filter((p) => p.type === "any").map((p) => p.name),
  );
  const paramTypes = new Map<string, string>();

  function recordType(name: string, type: string): void {
    if (!untypedNames.has(name)) return;
    if (paramTypes.has(name)) return;
    if (type === "any") return;
    paramTypes.set(name, type);
  }

  function walk(node: Node, expectedType?: string): string | undefined {
    switch (node.type) {
      case NodeType.HelperFunctionExpression: {
        const h = node as HelperFunctionNode;
        const meta = lookupHelper(h.name, allModules);

        if (meta) {
          for (let i = 0; i < h.args.length; i++) {
            const arg = h.args[i];
            const argExpected = resolveArgType(meta, i);

            if (
              arg.type === NodeType.VariableIdentifier &&
              untypedNames.has(arg.value)
            ) {
              if (argExpected) recordType(arg.value, argExpected);
            } else {
              walk(arg, argExpected);
            }
          }
          return normalizeReturnType(meta.returnType);
        }

        for (const arg of h.args) walk(arg);
        return undefined;
      }

      case NodeType.BinaryExpression: {
        const bin = node as { left: Node; right: Node };
        walkArithmetic(bin.left);
        walkArithmetic(bin.right);
        return "number";
      }

      case NodeType.VariableIdentifier: {
        if (expectedType && untypedNames.has(node.value!)) {
          recordType(node.value!, expectedType);
        }
        return expectedType;
      }

      case NodeType.ArrayExpression: {
        const arr = node as { elements: Node[] };
        for (const el of arr.elements) walk(el);
        return "array";
      }

      case NodeType.NumberLiteral:
        return "number";
      case NodeType.StringLiteral:
        return "string";
      case NodeType.AddressLiteral:
        return "address";
      case NodeType.BoolLiteral:
        return "bool";
      case NodeType.BytesLiteral:
        return "bytes";

      default:
        return undefined;
    }
  }

  function walkArithmetic(node: Node): void {
    if (node.type === NodeType.VariableIdentifier && untypedNames.has(node.value!)) {
      recordType(node.value!, "number");
    } else if (node.type === NodeType.BinaryExpression) {
      const bin = node as { left: Node; right: Node };
      walkArithmetic(bin.left);
      walkArithmetic(bin.right);
    } else {
      walk(node, "number");
    }
  }

  const returnType = walk(bodyNode);

  return { paramTypes, returnType };
}
