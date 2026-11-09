import { describe, expect, test } from "bun:test";
import { encodeFunctionData, erc721Abi, parseAbi } from "viem";
import { decodeCall } from "../../src";

const TO = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const none = async () => undefined;

describe("decoding a call from its bytes", () => {
  test("an ABI the host vouches for comes first, with its label", async () => {
    const abi = parseAbi(["function verify(uint8 scope)"]);
    const call = await decodeCall(
      {
        chainId: 1,
        to: TO,
        data: encodeFunctionData({ abi, functionName: "verify", args: [3] }),
      },
      {
        abiFor: async () => ({ abi, label: "verified on Sourcify" }),
        read: none,
      },
    );
    expect(call).toMatchObject({
      functionName: "verify",
      source: "verified",
      sourceLabel: "verified on Sourcify",
      args: [{ name: "scope", type: "uint8", shown: "3" }],
    });
  });

  test("approve on a contract without decimals() reads as ERC-721", async () => {
    const data = encodeFunctionData({
      abi: erc721Abi,
      functionName: "approve",
      args: [OTHER, 7n],
    });
    const call = await decodeCall({ chainId: 1, to: TO, data }, { read: none });
    expect(call).toMatchObject({
      sourceLabel: "matches ERC-721",
      args: [
        { name: "spender", shown: OTHER },
        { name: "tokenId", shown: "7" },
      ],
    });
  });

  test("calldata nothing decodes is shown word by word, labelled", async () => {
    const data = `0xdeadbeef${"00".repeat(31)}01` as const;
    const call = await decodeCall({ chainId: 1, to: TO, data }, { read: none });
    expect(call).toEqual({
      selector: "0xdeadbeef",
      source: "none",
      sourceLabel: "not decoded",
      words: ["0xdeadbeef", `${"00".repeat(31)}01`],
    });
  });

  test("no data: no call", async () => {
    expect(
      await decodeCall({ chainId: 1, to: TO, data: "0x" }, { read: none }),
    ).toBeUndefined();
  });

  test("text that changes how it reads is shown with its hidden characters written out", async () => {
    const abi = parseAbi(["function name(string label)"]);
    const call = await decodeCall(
      {
        chainId: 1,
        to: TO,
        data: encodeFunctionData({
          abi,
          functionName: "name",
          args: ["pay\u202eevil"],
        }),
      },
      { abiFor: async () => ({ abi, label: "verified source" }), read: none },
    );
    expect(call?.args?.[0]?.shown).toBe("pay\\u{202e}evil");
  });
});
