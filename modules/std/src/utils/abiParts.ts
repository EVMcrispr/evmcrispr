import type { Node } from "@evmcrispr/sdk";
import { ErrorException, NodeType, Num } from "@evmcrispr/sdk";
import type { BytesPart, CompileCtx } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  isBangHelperNode,
  wordPartParam,
} from "@evmcrispr/sdk/onchain";
import { encodeAbiParameters, encodePacked } from "viem";

/**
 * Shared part builder for the on-chain abi encoder faces: each value
 * becomes a byte-concatenation part — constants encode at composition
 * time and merge into single hex runs, live word values are cut to
 * their width through one slice each, and (packed mode only) live
 * string/bytes values pass their payload through raw.
 */

/** The packed byte range of a word-typed value inside its 32-byte word:
 *  value types are right-aligned, `bytesN` left-aligned. Null for types
 *  that do not fit in one word (string/bytes/arrays/tuples). */
export function packedWidth(t: string): { start: bigint; len: bigint } | null {
  if (t === "address") return { start: 12n, len: 20n };
  if (t === "bool") return { start: 31n, len: 1n };
  const m = /^(u?int)(\d*)$/.exec(t);
  if (m) {
    const bits = m[2] === "" ? 256 : Number(m[2]);
    if (bits % 8 !== 0 || bits < 8 || bits > 256) return null;
    const len = BigInt(bits / 8);
    return { start: 32n - len, len };
  }
  const b = /^bytes(\d+)$/.exec(t);
  if (b) {
    const len = BigInt(b[1]);
    if (len < 1n || len > 32n) return null;
    return { start: 0n, len };
  }
  return null;
}

const isDynamicBytesLike = (t: string) => t === "string" || t === "bytes";

export const isLiveNode = (n: Node): boolean =>
  n.type === NodeType.CallExpression || isBangHelperNode(n);

/** Coerce an interpreted constant for viem's encoders. */
export function toPackedValue(type: string, v: unknown): unknown {
  if (v instanceof Num) return v.toBigInt();
  if (type.startsWith("uint") || type.startsWith("int"))
    return BigInt(String(v));
  if (type === "bool") return v === "true" || v === true;
  return v;
}

/**
 * Build the concat parts for one encoder call. `types` are canonical
 * Solidity type strings, one per value node. In `packed` mode a value's
 * packed bytes are appended directly; in `head` mode every value —
 * constant or live — must be an elementary static type contributing its
 * full 32-byte head word. `prefix` (hex span, no 0x) seeds the first
 * constant run — the selector of an encoded call.
 */
export async function buildAbiParts(
  ctx: CompileCtx,
  types: readonly string[],
  valueNodes: readonly Node[],
  mode: "packed" | "head",
  helper: string,
  prefix = "",
): Promise<BytesPart[]> {
  const parts: BytesPart[] = [];
  let constRun: string | null = prefix === "" ? null : prefix;
  const flushConstRun = () => {
    if (constRun !== null) {
      parts.push(`0x${constRun}`);
      constRun = null;
    }
  };

  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const width = packedWidth(t);
    const node = valueNodes[i];
    const live = isLiveNode(node);

    if (mode === "head" && width === null) {
      throw new ErrorException(
        `@${helper} can only encode elementary static types on-chain — a \`${t}\` value re-encodes through offsets; keep the whole call constant, or use \`@abi.encodePacked!\` for raw bytes`,
      );
    }

    if (!live) {
      const value = await ctx.interpreters.interpretNode(node);
      let encoded: string;
      try {
        encoded =
          mode === "packed"
            ? encodePacked([t] as never, [toPackedValue(t, value)] as never)
            : encodeAbiParameters([{ type: t }], [toPackedValue(t, value)]);
      } catch (err) {
        throw new ErrorException(
          `@${helper} could not encode value ${i + 1} as \`${t}\`: ${
            (err as Error).message
          }`,
        );
      }
      constRun = (constRun ?? "") + encoded.slice(2);
      continue;
    }

    // A live value: only word-sized types (and, packed, string/bytes)
    // have an on-chain encoding.
    if (width === null && !isDynamicBytesLike(t)) {
      throw new ErrorException(
        `@${helper} can only splice elementary and string/bytes values — a live \`${t}\` must be a composition-time constant`,
      );
    }

    const o = await compileOperand(ctx, node);
    if (o.kind === "const") {
      throw new ErrorException(
        `@${helper} could not compile value ${i + 1} — pass it as a plain constant`,
      );
    }
    if (o.scale !== undefined && o.scale !== 0) {
      throw new ErrorException(
        `@${helper} cannot encode a fixed-point value — scale it to base units first`,
      );
    }

    if (width !== null) {
      if (o.cat === "String" || o.cat === "Bytes") {
        throw new ErrorException(
          `@${helper} value ${i + 1} resolves a ${o.cat.toLowerCase()} value where \`${t}\` expects a word`,
        );
      }
      flushConstRun();
      const { start, len } =
        mode === "packed" ? width : { start: 0n, len: 32n };
      parts.push({
        param: wordPartParam(ctx, o.param, start, len),
        size: Number(len),
      });
      continue;
    }

    // packed string/bytes: the resolved envelope's payload IS the packed
    // encoding, so the operand rides as a plain live part.
    if (o.cat !== "String" && o.cat !== "Bytes") {
      throw new ErrorException(
        `@${helper} value ${i + 1} resolves a word where \`${t}\` expects a string/bytes value`,
      );
    }
    flushConstRun();
    parts.push(o.param);
  }

  flushConstRun();
  return parts;
}
