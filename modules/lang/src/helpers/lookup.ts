import type { Node, Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx, InputParam } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  constBigInt,
  hashParamOf,
  stringDigest,
  unzipParam,
  wordAtParam,
  wordIndexOfParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

/** The lookup key as a word: build-time literal string keys are
 *  keccak-hashed at composition time (string keys travel as their
 *  digests in the record representation), other constants fold to their
 *  word; live string/bytes keys take the digest path through `hash`,
 *  live word keys pass through as themselves. */
async function keyWord(
  ctx: CompileCtx,
  node: Node,
): Promise<bigint | InputParam> {
  const o = await compileOperand(ctx, node);
  if (o.kind === "call") {
    // Live keys take the digest path: string/bytes values hash on-chain
    // to the same digest their build-time literals fold to; word values
    // pass through as themselves.
    if (o.cat === "String" || o.cat === "Bytes") {
      return hashParamOf(ctx, o.param);
    }
    return o.param;
  }
  return o.cat === "String"
    ? BigInt(stringDigest(o.value as string))
    : constBigInt(o);
}

export default defineHelper<Lang>({
  name: "lookup",
  description:
    "Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs).",
  compileDescription:
    "The record is a `@zip!`/`@enumerate!` word-pair payload, string names travel as keccak digests, and a missing name reverts.",
  returnType: "any",
  args: [
    {
      name: "record",
      type: "record",
      description: "Record (entries array) to look the name up in",
    },
    {
      name: "name",
      type: "string",
      description: "Entry name to look up",
    },
  ],
  async run(_, { record, name }) {
    const key = String(name);
    const entry = (record as [string, Param][]).find(
      ([entryName]) => String(entryName) === key,
    );
    if (!entry) {
      const known = (record as [string, Param][])
        .map(([entryName]) => String(entryName))
        .join(", ");
      throw new ErrorException(
        `@lookup: no entry named "${key}"${known ? ` — record has: ${known}` : " — record is empty"}`,
      );
    }
    return entry[1];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@lookup! expects (record name), e.g. @lookup!(@zip!($reg::names() $reg::caps()) 42)",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "lookup!");
    const key = await keyWord(ctx, node.args[1]);
    // unzipWords splits the record into its key and value lanes,
    // wordIndexOf finds the key's pair index, and a word-index read of
    // the values lane selects the value. The not-found sentinel is the
    // lane's word COUNT, so a missing key pushes the value slice out of
    // bounds and the assertion reverts (the off-chain face raises the
    // same no-entry error at run time).
    const keysLane = unzipParam(ctx, payload, 0n);
    const valuesLane = unzipParam(ctx, payload, 1n);
    const index = wordIndexOfParam(ctx, keysLane, key);
    return {
      kind: "call",
      param: wordAtParam(ctx, valuesLane, index),
      cat: "Uint",
    };
  },
});
