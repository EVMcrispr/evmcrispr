import type { DestructureSlot } from "@evmcrispr/sdk";
import {
  defineHelper,
  ErrorException,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import {
  applyValueLens,
  categoryFromAbiType,
  chainArgWithLens,
  lensPath,
  lensSelectData,
  lensSlots,
  payloadParam,
  requireBytesLike,
  staticCallParam,
  walkNavPath,
} from "@evmcrispr/sdk/onchain";
import type { AbiParameter } from "viem";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import type Std from "..";

const LENS_CONTEXT =
  'selecting one decoded value, e.g. @abi.decode!("uint256,address" $data [_ $])';

function parseTypeList(types: string): readonly AbiParameter[] {
  try {
    return parseAbiParameters(types) as readonly AbiParameter[];
  } catch (_err) {
    throw new ErrorException(`invalid type list: "${types}"`);
  }
}

/** Validate the lens against the declared types the same way the compile
 *  face does, so the two faces reject identically, then apply it to the
 *  decoded values. */
function selectDecodedValue(
  params: readonly AbiParameter[],
  slots: DestructureSlot[],
  decoded: readonly unknown[],
): unknown {
  walkNavPath(params, lensPath(slots), "@abi.decode");
  return applyValueLens([...decoded], slots);
}

export default defineHelper<Std>({
  name: "abi.decode",
  description:
    "Decode ABI-encoded bytes into values given a comma-separated type list; a lens selects one of them.",
  compileDescription:
    "Needs a [_ $] lens and returns only the selected value; the data argument must be a live call or bytes expression, and array selections are refused.",
  // "any" because the lens form returns the selected value, whose type is
  // the type list's business; the bare form returns the decoded array.
  returnType: "any",
  args: [
    {
      name: "types",
      type: "string",
      description: 'Comma-separated Solidity types (e.g. "uint256,address")',
    },
    { name: "data", type: "bytes", description: "ABI-encoded hex data" },
    {
      name: "lens",
      type: "array",
      optional: true,
      description:
        "A [_ $] lens selecting one decoded value; without it the whole decoded array is returned",
    },
  ],
  async run(_, { types, data, lens }, { node }) {
    let params: readonly AbiParameter[];
    try {
      params = parseTypeList(types);
    } catch (err) {
      throw new HelperFunctionError(node, (err as Error).message);
    }

    let decoded: readonly unknown[];
    try {
      decoded = decodeAbiParameters(params, data);
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `failed to decode: ${(err as Error).message}`,
      );
    }
    if (lens === undefined) return [...decoded] as any;
    return selectDecodedValue(
      params,
      lensSlots(lens, LENS_CONTEXT),
      decoded,
    ) as any;
  },
  compile: async (ctx, node) => {
    const [typesNode, dataNode, lensNode] = node.args;
    if (!typesNode || !dataNode) {
      throw new ErrorException(
        '@abi.decode! expects a type list and a data expression, e.g. @abi.decode!("uint256,address" $data [_ $])',
      );
    }
    if (!lensNode) {
      throw new ErrorException(
        `@abi.decode! needs a lens: an on-chain expression yields one value, so select it with [_ $], e.g. @abi.decode!("uint256,address" $data [_ $])`,
      );
    }
    const types = String(await ctx.interpreters.interpretNode(typesNode));
    const params = parseTypeList(types);
    const slots = lensSlots(lensNode, LENS_CONTEXT);

    // The blob is any bytes-like expression. Its payload is read in place:
    // a `::` call lens reaching a bytes field keeps that nav's own path and
    // the PAYLOAD sentinel appends to it, so re-entry costs no extra frame.
    const arg = await chainArgWithLens(ctx, "abi.decode!", dataNode);
    requireBytesLike(arg, "abi.decode!");
    const base = payloadParam(ctx, arg.param, arg.outputs, arg.path ?? [0]);

    // The type list is the author's claim about the payload's encoding,
    // exactly as a nav descriptor is; the lens walks that claim.
    const { data, terminal } = lensSelectData(
      base,
      params,
      slots,
      "@abi.decode!",
    );
    if (/\[\d*\]$/.test(terminal.type)) {
      throw new ErrorException(
        `@abi.decode! cannot return an array selection (${terminal.type}); select an element or a string/bytes value`,
      );
    }
    return {
      kind: "call",
      param: staticCallParam(ctx.core, data),
      cat: categoryFromAbiType(terminal.type),
    };
  },
});
