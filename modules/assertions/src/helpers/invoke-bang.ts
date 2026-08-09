import {
  ErrorException,
  NodeType,
  splitReadAbiSignature,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { getAddress, isAddress, parseAbiItem } from "viem";
import { encodeInvoke } from "../lib/combinators";
import type { Operand } from "../lib/compiler";
import {
  categoryFromAbiType,
  chainParam,
  combinatorCall,
  compileArgSpecs,
  requireChainArg,
} from "../lib/compiler";
import { buildCallSegments } from "../lib/construct";
import type { InputParam } from "../lib/erc8211";
import { wordParam } from "../lib/erc8211";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "invoke!",
  description:
    "Call a read-only function with live arguments at assertion time: the target and any argument may be a `::` call or an on-chain helper, compiled to the combinators `invoke` primitive.",
  returnType: "any",
  args: [
    {
      name: "target",
      type: "address",
      description:
        "Contract address, or a `::` call expression resolving to one",
    },
    {
      name: "abi",
      type: "read-abi",
      description:
        "Signature with return types, e.g. `balanceOf(address)(uint256)`",
    },
    {
      name: "params",
      type: "any",
      description:
        "Function arguments: constants, `::` calls or on-chain helpers",
      rest: true,
    },
  ],
  compileAssert: async (ctx, node): Promise<Operand> => {
    const [targetNode, abiNode, ...paramNodes] = node.args;
    if (!targetNode || !abiNode) {
      throw new ErrorException(
        "@invoke! expects (target abi ...params), e.g. @invoke!($vault `convertToAssets(uint256)(uint256)` 1e18)",
      );
    }

    const abiValue = await ctx.interpreters.interpretNode(abiNode);
    const parts = splitReadAbiSignature(String(abiValue));
    if (!parts) {
      throw new ErrorException(
        `@invoke! expected a read-abi signature with return types, got ${String(abiValue)}`,
      );
    }
    const fnAbi = parseAbiItem(
      `function ${parts.body} view returns ${parts.returns}`,
    ) as AbiFunction;
    if (fnAbi.outputs?.length !== 1) {
      throw new ErrorException(
        "@invoke! signature must declare exactly one return type",
      );
    }
    const cat = categoryFromAbiType(fnAbi.outputs[0].type);

    let target: InputParam;
    if (targetNode.type === NodeType.CallExpression) {
      const chain = await requireChainArg(ctx, "invoke!", targetNode);
      const out = chain.lastAbi.outputs?.[0];
      if (chain.lastAbi.outputs?.length !== 1 || out?.type !== "address") {
        throw new ErrorException(
          "@invoke! target call must return a single address",
        );
      }
      target = chainParam(ctx, chain);
    } else {
      const targetValue = await ctx.interpreters.interpretNode(targetNode);
      if (typeof targetValue !== "string" || !isAddress(targetValue)) {
        throw new ErrorException(
          `@invoke! target must resolve to an address, got ${targetValue}`,
        );
      }
      target = wordParam(BigInt(getAddress(targetValue)));
    }

    const specs = await compileArgSpecs(ctx, paramNodes, fnAbi, "@invoke!");
    const call = buildCallSegments(fnAbi, specs);
    return combinatorCall(
      ctx,
      encodeInvoke(target, call.selector, call.segments),
      cat,
    );
  },
});
