import { defineHelper } from "@evmcrispr/sdk";
import {
  type Hex,
  type TypedDataDomain,
  verifyMessage,
  verifyTypedData,
} from "viem";
import type Std from "..";

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

export default defineHelper<Std>({
  name: "sigValid",
  description:
    "Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message.",
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
});
