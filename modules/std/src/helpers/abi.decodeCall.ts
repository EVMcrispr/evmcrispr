import type { Node } from "@evmcrispr/sdk";
import {
  defineHelper,
  ErrorException,
  fetchAbi,
  findAbiFunctionBySelector,
  HelperFunctionError,
  lookupFunctionSignature,
  makeEnsResolver,
  NodeType,
  renderAbiValue,
} from "@evmcrispr/sdk";
import type { InputParam } from "@evmcrispr/sdk/onchain";
import {
  calldataArgsParam,
  categoryFromAbiType,
  chainArgWithLens,
  constraint,
  encodeCond,
  encodePick,
  lensedDataOperand,
  lensSelectData,
  lensSlots,
  payloadParam,
  rawParam,
  requireBytesLike,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import {
  decodeFunctionData,
  getAddress,
  parseAbiItem,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";
import type Std from "..";

const BANG_HINT =
  "e.g. @abi.decodeCall!($queue::{txData()(bytes)} transfer(address,uint256) [_ $])";

export default defineHelper<Std>({
  name: "abi.decodeCall",
  description:
    "Decode calldata into `[contract signature [args]]` with human-readable EVML values.",
  compileDescription:
    "Takes an inline signature and a lens instead of fetching an ABI; checks the selector on-chain (a mismatch reverts) and returns only the selected argument.",
  // "any" because the on-chain face returns the selected argument, whose
  // type is the signature's business; the off-chain face returns the
  // rendered [contract signature [args]] array.
  returnType: "any",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Contract the calldata targets (its verified ABI is used)",
    },
    {
      name: "calldata",
      type: "bytes",
      description: "Full calldata including the 4-byte function selector",
    },
  ],
  async run(module, { contract, calldata }, { node }) {
    const target = getAddress(contract);
    if (calldata.length < 10) {
      throw new HelperFunctionError(
        node,
        "calldata is too short to contain a function selector",
      );
    }
    const selector = calldata.slice(0, 10);

    // Primary source: the contract's verified ABI (proxy-aware).
    let fnAbi: AbiFunction | undefined;
    try {
      const [, abi] = await fetchAbi(target, await module.getClient());
      fnAbi = findAbiFunctionBySelector(abi, selector);
    } catch {
      // Unverified contract or ABI service failure — fall through.
    }

    // Fallback: openchain.xyz signature database.
    if (!fnAbi) {
      const signature = await lookupFunctionSignature(selector);
      if (signature) {
        try {
          fnAbi = parseAbiItem(`function ${signature}`) as AbiFunction;
        } catch {
          fnAbi = undefined;
        }
      }
    }

    if (!fnAbi) {
      throw new HelperFunctionError(
        node,
        `could not resolve selector ${selector} for ${target}`,
      );
    }

    let args: readonly unknown[];
    try {
      ({ args = [] } = decodeFunctionData({ abi: [fnAbi], data: calldata }));
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `failed to decode calldata: ${(err as Error).message}`,
      );
    }

    const resolveEns = makeEnsResolver(module);
    const rendered = await Promise.all(
      fnAbi.inputs.map((param, i) =>
        renderAbiValue(param, args[i], resolveEns),
      ),
    );

    return [target, toFunctionSignature(fnAbi), rendered];
  },
  compile: async (ctx, node) => {
    const [dataNode, sigNode, lensNode] = node.args;
    if (!dataNode || !sigNode) {
      throw new ErrorException(
        `@abi.decodeCall! expects a calldata expression, an inline signature and a lens, ${BANG_HINT}`,
      );
    }
    // The signature parses first: a lens sitting in its slot means the
    // signature is what is missing, and the message should say so.
    const sig =
      (sigNode as Node).type === NodeType.Bareword
        ? String((sigNode as unknown as { value: unknown }).value)
        : undefined;
    let fn: AbiFunction | undefined;
    if (sig) {
      try {
        fn = parseAbiItem(`function ${sig}`) as AbiFunction;
      } catch {
        fn = undefined;
      }
    }
    if (fn?.type !== "function") {
      throw new ErrorException(
        `cannot read "${sig}" as a function signature — the on-chain face takes it inline, ${BANG_HINT}`,
      );
    }
    if (!lensNode) {
      throw new ErrorException(
        "@abi.decodeCall! needs a lens: an on-chain expression yields one value, so select an argument with [_ $]",
      );
    }
    const selector = toFunctionSelector(fn);
    const slots = lensSlots(
      lensNode,
      `selecting one call argument, ${BANG_HINT}`,
    );

    // The calldata: any bytes-like expression; a `::` lens reaching a
    // bytes field keeps its own nav.
    const arg = await chainArgWithLens(ctx, "abi.decodeCall!", dataNode);
    requireBytesLike(arg, "abi.decodeCall!");
    const data = lensedDataOperand(ctx, arg);

    // The selector guard: the first payload word's top four bytes, judged
    // EQ the declared selector as a constraint on the condition operand —
    // a mismatch reverts the whole cond with ConstraintFailed carrying the
    // actual selector. Decoding foreign calldata as the wrong function
    // would otherwise read plausible garbage.
    const firstWord = staticCallParam(ctx.core, encodePick(data, 2n));
    const shifted = wordOpParam(
      ctx,
      "shr",
      false,
      firstWord,
      rawParam(toWord(224n)),
    );
    const guard: InputParam = {
      ...shifted,
      constraints: [constraint("Eq", BigInt(selector))],
    };

    // The selection: slice the selector off (words realign), re-enter the
    // args tuple through the PAYLOAD sentinel, and navigate the
    // signature's input types. Both cond branches carry the same
    // selection: the guard's constraint does the judging, so the branch
    // taken never matters.
    const argsBlob = calldataArgsParam(ctx, data);
    const stripped = payloadParam(ctx, argsBlob, [{ type: "bytes" }], [0]);
    const { data: navData, terminal } = lensSelectData(
      stripped,
      fn.inputs,
      slots,
      "@abi.decodeCall!",
    );
    if (/\[\d*\]$/.test(terminal.type)) {
      throw new ErrorException(
        `@abi.decodeCall! cannot return an array selection (${terminal.type}); select an element or a string/bytes value`,
      );
    }
    const selection = staticCallParam(ctx.core, navData);
    return {
      kind: "call",
      param: staticCallParam(ctx.core, encodeCond(guard, selection, selection)),
      cat: categoryFromAbiType(terminal.type),
    };
  },
});
