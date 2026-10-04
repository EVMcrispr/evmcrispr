import type { CallExpressionNode, Node } from "@evmcrispr/sdk";
import {
  defineHelper,
  ErrorException,
  ErrorInvalid,
  fieldItem,
  NodeType,
} from "@evmcrispr/sdk";
import type { CompileCtx, InputParam, Operand } from "@evmcrispr/sdk/onchain";
import {
  compileCallValue,
  compileOnchainHelper,
  concatParam,
  hashParamOf,
  isBangHelperNode,
  sha256Param,
  wordPartParam,
  wordPreimageHint,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import { isHex, keccak256, sha256, toHex } from "viem";
import type Std from "..";
import { packedWidth } from "../utils/abiParts";

/** What the second argument selects: how the input is read, and the
 *  function. Text is hashed as its UTF-8 bytes; in a bytes mode a hex value
 *  is hashed as the bytes it spells, not as its characters. */
const modes = {
  keccak256: { fn: keccak256, reads: "text" },
  bytes: { fn: keccak256, reads: "bytes" },
  sha256: { fn: sha256, reads: "text" },
  "bytes-sha256": { fn: sha256, reads: "bytes" },
} as const;

type Mode = keyof typeof modes;

const isMode = (name: string): name is Mode => Object.hasOwn(modes, name);

/** The mode with the same function and the other reading. */
const otherReading: Record<Mode, Mode> = {
  keccak256: "bytes",
  bytes: "keccak256",
  sha256: "bytes-sha256",
  "bytes-sha256": "sha256",
};

/** The digest of a value known when the script is built. Both faces go
 *  through here, so a constant cannot hash differently on the two. */
function digest(value: unknown, mode: Mode, helper: string): Hex {
  const { fn, reads } = modes[mode];
  if (reads === "text") return fn(toHex(String(value)));
  if (typeof value !== "string" || !isHex(value) || value.length % 2 !== 0) {
    throw new ErrorInvalid(
      `@${helper} in \`${mode}\` mode hashes a hex bytes value, got ${String(value)}; use \`${otherReading[mode]}\` to hash it as text`,
    );
  }
  return fn(value);
}

/** Spell a refusal's example inside the call the author is writing. */
const inBytesMode = (mode: Mode) => (encoderCall: string) =>
  `@hash!(${encoderCall} ${modes[mode].reads === "bytes" ? mode : otherReading[mode]})`;

/** A live operand is text or bytes by its type, and the mode has to say the
 *  same. On-chain both are payload bytes and hash alike; the off-chain face
 *  reads them differently, so a mismatch accepted here would be a script
 *  whose two faces disagree. */
function requireReading(kind: "string" | "bytes", mode: Mode): void {
  const wanted = kind === "bytes" ? "bytes" : "text";
  if (modes[mode].reads === wanted) return;
  throw new ErrorException(
    kind === "bytes"
      ? `@hash! reads its argument as text in \`${mode}\` mode, and this one is bytes: write @hash!(… ${otherReading[mode]})`
      : `@hash! reads its argument as bytes in \`${mode}\` mode, and this one is a string: write @hash!(… ${otherReading[mode]})`,
  );
}

/** The bytes a word of this ABI type carries on its own: an address is 20
 *  bytes and `bytesN` is N, which is also what the off-chain face holds for
 *  such a value. A number has no width of its own (`0xff` is one byte
 *  off-chain and a uint256 is 32 on-chain), so integers and bools are not
 *  here and keep needing an encoder. */
function ownWidth(type: string | undefined) {
  if (type !== "address" && !/^bytes\d+$/.test(type ?? "")) return null;
  return packedWidth(type as string);
}

const describeWord = (type: string, bytes: bigint) =>
  type === "address" ? "an address" : `a ${type} (${bytes} bytes)`;

/** A word hashes as bytes only: read as text it would be its hex spelling,
 *  which exists off-chain alone. */
function requireWordInBytesMode(mode: Mode, type: string, bytes: bigint): void {
  if (modes[mode].reads === "bytes") return;
  throw new ErrorException(
    `@hash! reads its argument as text in \`${mode}\` mode, and this one is ${describeWord(type, bytes)}: write @hash!(… ${otherReading[mode]}) to hash its ${bytes} bytes`,
  );
}

async function compileHash(
  ctx: CompileCtx,
  node: Node,
  mode: Mode,
): Promise<Operand> {
  const live = (param: InputParam): Operand => ({
    kind: "call",
    param:
      modes[mode].fn === sha256
        ? sha256Param(ctx, param)
        : hashParamOf(ctx, param),
    cat: "Bytes32",
    abiType: { type: "bytes32" },
  });

  /** A live word of a type with its own width, cut to that width the way
   *  @abi.encodePacked! cuts it. Null when the type has none. */
  const ownBytes = (param: InputParam, type: string | undefined) => {
    const width = ownWidth(type);
    if (!width) return null;
    requireWordInBytesMode(mode, type as string, width.len);
    return live(
      concatParam(ctx, [
        {
          param: wordPartParam(ctx, param, width.start, width.len),
          size: Number(width.len),
        },
      ]),
    );
  };

  if (isBangHelperNode(node)) {
    const o = await compileOnchainHelper(ctx, node);
    if (o.cat === "String" || o.cat === "Bytes") {
      requireReading(o.cat === "Bytes" ? "bytes" : "string", mode);
      // An encoder over constants only is itself a constant.
      return o.kind === "const"
        ? {
            kind: "const",
            cat: "Bytes32",
            value: digest(o.value, mode, "hash!"),
          }
        : live(o.param);
    }
    // A helper's word has its own width only when the helper says so: an
    // address, or a declared bytesN. Any other word is refused rather than
    // hashed, because its ABI encoding and its packed bytes give different
    // digests and the script has to say which.
    const type =
      o.cat === "Address"
        ? "address"
        : o.kind === "call" && o.cat === "Bytes32"
          ? o.abiType?.type
          : undefined;
    if (o.kind === "call") {
      const hashed = ownBytes(o.param, type);
      if (hashed) return hashed;
    } else if (type === "address") {
      requireWordInBytesMode(mode, "address", 20n);
      return {
        kind: "const",
        cat: "Bytes32",
        value: digest(o.value, mode, "hash!"),
      };
    }
    throw new ErrorException(
      `@hash! needs a string or bytes value, and its nested helper resolves a single word. ${wordPreimageHint(undefined, inBytesMode(mode))}`,
    );
  }

  if (node.type === NodeType.CallExpression) {
    const { param, terminal } = await compileCallValue(
      ctx,
      node as CallExpressionNode,
    );
    const type = terminal.type;
    if (type === "string" || type === "bytes") {
      requireReading(type, mode);
      return live(param);
    }
    const hashed = ownBytes(param, type);
    if (hashed) return hashed;
    throw new ErrorException(
      `@hash! needs a string or bytes value, got ${type}. ${wordPreimageHint(type, inBytesMode(mode))}`,
    );
  }

  return {
    kind: "const",
    cat: "Bytes32",
    value: digest(await ctx.interpreters.interpretNode(node), mode, "hash!"),
  };
}

export default defineHelper<Std>({
  name: "hash",
  description:
    "Hash a string with keccak256 (default) or sha256, or a hex value as bytes with the `bytes` modes.",
  compileDescription:
    "Bytes, an address or a bytesN need a `bytes` mode and a string a text mode; a number is refused until an encoder states its bytes.",
  returnType: "bytes32",
  args: [
    {
      name: "text",
      type: "string",
      description:
        "Text to hash (e.g. a function signature), or a hex value in a `bytes` mode",
    },
    {
      name: "algorithm",
      type: "string",
      optional: true,
      description:
        "`keccak256` (default) or `sha256` hash the text; `bytes` (keccak256) or `bytes-sha256` hash a hex value as its bytes",
    },
  ],
  completions: {
    algorithm: () => Object.keys(modes).map(fieldItem),
  },
  async run(_, { text, algorithm = "keccak256" }) {
    if (!isMode(algorithm)) {
      throw new ErrorInvalid(
        `unknown hash algorithm "${algorithm}"; expected one of: ${Object.keys(modes).join(", ")}`,
      );
    }
    return digest(text, algorithm, "hash");
  },
  compile: async (ctx, node) => {
    if (node.args.length < 1 || node.args.length > 2) {
      throw new ErrorException(
        "@hash! expects a single value (plus an optional mode)",
      );
    }
    let mode = "keccak256";
    if (node.args.length === 2) {
      mode = String(await ctx.interpreters.interpretNode(node.args[1]));
      if (!isMode(mode)) {
        throw new ErrorException(
          `unknown hash algorithm "${mode}"; @hash! expects one of: ${Object.keys(modes).join(", ")}`,
        );
      }
    }
    return compileHash(ctx, node.args[0], mode as Mode);
  },
});
