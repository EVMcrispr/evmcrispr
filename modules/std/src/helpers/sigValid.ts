import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { InputParam, Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  encodeOrElse,
  encodePick,
  OPERATORS_ABI,
  oneLiveBytesCallParam,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import {
  encodeFunctionData,
  getAddress,
  type Hex,
  hashMessage,
  hashTypedData,
  isHex,
  parseAbi,
  type TypedDataDomain,
  verifyMessage,
  verifyTypedData,
} from "viem";
import type Std from "..";
import { isLiveNode } from "../utils/abiParts";

interface TypedDataPayload {
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
  domain?: TypedDataDomain;
}

function tryParseTypedData(data: string): TypedDataPayload | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      "types" in parsed &&
      "primaryType" in parsed &&
      "message" in parsed &&
      typeof parsed.types === "object" &&
      typeof parsed.primaryType === "string" &&
      typeof parsed.message === "object"
    ) {
      return parsed as unknown as TypedDataPayload;
    }
  } catch {
    // not JSON, fall through to plain message
  }
  return null;
}

const ECRECOVER = 1n;
const ERC1271_ABI = parseAbi([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);
// The ERC-1271 magic value, left-aligned in the returned bytes4 word.
const ERC1271_MAGIC = `0x1626ba7e${"00".repeat(28)}` as Hex;

export default defineHelper<Std>({
  name: "sigValid",
  description:
    "Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message.",
  compileDescription:
    "Contract signers verify through ERC-1271 (the plain face cannot); the signer and message must be constants, and a delegated account verifies against its key.",
  returnType: "bool",
  args: [
    {
      name: "address",
      type: "address",
      description: "Expected signer address",
    },
    {
      name: "data",
      type: "string",
      description:
        "Plain-text message, or EIP-712 typed data JSON string (matching what was signed).",
    },
    {
      name: "signature",
      type: "bytes",
      description: "Hex-encoded signature to verify",
    },
  ],
  async run(_, { address, data, signature }) {
    const sig = signature as Hex;
    const addr = address as Hex;
    try {
      const typed = tryParseTypedData(data);
      if (typed) {
        const ok = await verifyTypedData({
          address: addr,
          signature: sig,
          domain: typed.domain ?? {},
          types: typed.types,
          primaryType: typed.primaryType,
          message: typed.message,
        } as Parameters<typeof verifyTypedData>[0]);
        return ok ? "true" : "false";
      }
      const ok = await verifyMessage({
        address: addr,
        message: data,
        signature: sig,
      });
      return ok ? "true" : "false";
    } catch {
      return "false";
    }
  },
  // The digest (EIP-191 or EIP-712, JSON-sniffed like the plain face) is
  // computed from the constant message; only the verification runs at
  // judgement. A signer WITH code is checked through ERC-1271
  // `isValidSignature` — no relation to the core's `isValid` resolution
  // probe — comparing the returned magic word; one without code goes
  // through the ECDSA recovery precompile, whose empty return on a bad
  // signature surfaces as a revert the orElse turns into false, matching
  // the plain face's catch-all. Valid-looking constant inputs are NOT
  // folded: the recovery itself is the assertable content.
  compile: async (ctx, node) => {
    const [addrNode, dataNode, sigNode] = node.args;
    if (!addrNode || !dataNode || !sigNode) {
      throw new ErrorException("@sigValid! expects (signer message signature)");
    }
    if (isLiveNode(addrNode) || isLiveNode(dataNode)) {
      throw new ErrorException(
        "@sigValid! signer and message must be constants",
      );
    }
    const address = getAddress(
      String(await ctx.interpreters.interpretNode(addrNode)),
    );
    const data = String(await ctx.interpreters.interpretNode(dataNode));
    const typed = tryParseTypedData(data);
    const digest = typed
      ? hashTypedData({
          domain: typed.domain ?? {},
          types: typed.types,
          primaryType: typed.primaryType,
          message: typed.message,
        } as Parameters<typeof hashTypedData>[0])
      : hashMessage(data);

    let sigParam: InputParam | null = null;
    let sigConst: Hex | null = null;
    if (isLiveNode(sigNode)) {
      const o = await compileOperand(ctx, sigNode);
      if (o.kind !== "call" || (o.cat !== "Bytes" && o.cat !== "String")) {
        throw new ErrorException(
          "@sigValid! a live signature must resolve a bytes value",
        );
      }
      sigParam = o.param;
    } else {
      const v = await ctx.interpreters.interpretNode(sigNode);
      if (typeof v !== "string" || !isHex(v)) {
        throw new ErrorException(
          "@sigValid! signature must be a hex bytes value",
        );
      }
      sigConst = v as Hex;
    }

    const client = await ctx.module.getClient();
    const code = await client.getCode({ address });
    // An EIP-7702 delegation designator (0xef0100 || delegate) is an EOA
    // wearing a coat: the plain face verifies its ECDSA key, so the
    // on-chain face recovers against the same key rather than trusting
    // whatever isValidSignature the delegate happens to expose. (The
    // well-known anvil keys are delegated on several public chains, so
    // this is not a theoretical case.)
    const hasCode =
      code !== undefined &&
      code !== "0x" &&
      !code.toLowerCase().startsWith("0xef0100");

    const asBool = (eq: InputParam): Operand => ({
      kind: "call",
      param: staticCallParam(ctx.core, encodeOrElse(eq, rawParam(toWord(0n)))),
      cat: "Bool",
    });

    if (hasCode) {
      const call = sigParam
        ? oneLiveBytesCallParam(
            ctx,
            rawParam(toWord(BigInt(address))),
            "0x1626ba7e",
            // bytes32 hash, then the offset pointing at the spliced
            // envelope past the two head words (+32 trick).
            [digest.slice(2), toWord(96n).slice(2)],
            sigParam,
          )
        : staticCallParam(
            address,
            encodeFunctionData({
              abi: ERC1271_ABI,
              functionName: "isValidSignature",
              args: [digest, sigConst as Hex],
            }),
          );
      return asBool(
        wordOpParam(ctx, "eq", false, call, rawParam(ERC1271_MAGIC)),
      );
    }

    if (sigParam) {
      throw new ErrorException(
        "@sigValid! a live signature can only be verified against a contract signer implementing ERC-1271",
      );
    }
    const sigHex = (sigConst as Hex).slice(2);
    const falseConst: Operand = { kind: "const", cat: "Bool", value: false };
    if (sigHex.length !== 130) return falseConst;
    const r = sigHex.slice(0, 64);
    const s = sigHex.slice(64, 128);
    let v = Number.parseInt(sigHex.slice(128, 130), 16);
    if (v === 0 || v === 1) v += 27;
    if (v !== 27 && v !== 28) return falseConst;

    // rawCall to the recovery precompile with all-literal calldata; the
    // digest word of the returned bytes VALUE is word 2 of its envelope.
    const recover = staticCallParam(
      ctx.operators,
      encodeFunctionData({
        abi: OPERATORS_ABI,
        functionName: "rawCall",
        args: [
          getAddress(`0x${ECRECOVER.toString(16).padStart(40, "0")}`),
          `0x${digest.slice(2)}${toWord(BigInt(v)).slice(2)}${r}${s}`,
        ],
      }),
    );
    const recovered = staticCallParam(ctx.core, encodePick(recover, 2n));
    return asBool(
      wordOpParam(
        ctx,
        "eq",
        false,
        recovered,
        rawParam(toWord(BigInt(address))),
      ),
    );
  },
});
