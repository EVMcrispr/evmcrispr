import {
  type Abi,
  decodeFunctionData,
  type Hex,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";

/** Explicit ABI decoding: no RPC, explorers, signature registries or ENS. */
export function decodeLocalCall(abi: Abi, data: Hex) {
  const candidates = abi.filter(
    (item) =>
      item.type === "function" &&
      toFunctionSelector(item).toLowerCase() ===
        data.slice(0, 10).toLowerCase(),
  );
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "ambiguous calldata selector"
        : "unknown calldata selector",
    );
  const fn = candidates[0];
  if (fn.type !== "function") throw new Error("expected function ABI");
  const { args = [] } = decodeFunctionData({ abi: [fn], data });
  return { signature: toFunctionSignature(fn), args, inputs: fn.inputs };
}
