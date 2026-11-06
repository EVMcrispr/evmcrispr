import { describe, expect, it } from "bun:test";
import {
  recoverTransactionAddress,
  recoverTypedDataAddress,
  type TransactionSerializable,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  confirmingAccount,
  describeSignature,
  printable,
} from "../src/lib/local-signer";

// Anvil's account #1.
const KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const base = privateKeyToAccount(KEY);

const tx: TransactionSerializable = {
  chainId: 1,
  type: "eip1559",
  to: "0x1111111111111111111111111111111111111111",
  value: 1_500_000_000_000_000_000n,
  data: "0xa9059cbb00000000000000000000000022222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000000005",
  nonce: 0,
  gas: 21_000n,
  maxFeePerGas: 2n,
  maxPriorityFeePerGas: 1n,
};

const frameTx = {
  chainId: 1337,
  type: "frame",
  sender: base.address,
  nonce: 0,
  frames: [
    {
      mode: 1,
      flags: 3,
      target: null,
      limits: { execution: 50_000n, state: 0n },
      value: 0n,
      data: "0x12345678",
    },
    {
      mode: 2,
      flags: 4,
      target: "0x1111111111111111111111111111111111111111",
      limits: { execution: 100_000n, state: 20_000n },
      value: 2_000_000_000_000_000_000n,
      data: "0xa9059cbb0000",
    },
    {
      mode: 0,
      flags: 0,
      target: "0x3333333333333333333333333333333333333333",
      limits: { execution: 30_000n, state: 0n },
      value: 0n,
      data: "0x",
    },
  ],
};

describe("confirmingAccount", () => {
  it("signs only after confirmation", async () => {
    const refused = confirmingAccount(base, async () => false);
    await expect(refused.signTransaction(tx)).rejects.toThrow("Not signed");
    await expect(refused.signMessage({ message: "hi" })).rejects.toThrow(
      "Not signed",
    );
    await expect(
      refused.signTypedData({
        domain: { name: "x" },
        types: { M: [{ name: "a", type: "uint256" }] },
        primaryType: "M",
        message: { a: 1n },
      }),
    ).rejects.toThrow("Not signed");
    await expect(
      refused.sign!({ hash: `0x${"11".repeat(32)}` }),
    ).rejects.toThrow("Not signed");

    const summaries: string[] = [];
    const accepted = confirmingAccount(base, async (summary) => {
      summaries.push(summary);
      return true;
    });
    const signed = await accepted.signTransaction(tx);
    expect(
      await recoverTransactionAddress({ serializedTransaction: signed as any }),
    ).toBe(base.address);
    expect(summaries).toHaveLength(1);
    expect(accepted.address).toBe(base.address);
  });

  it("labels the signatures made inside labelled", async () => {
    const summaries: string[] = [];
    const account = confirmingAccount(base, async (summary) => {
      summaries.push(summary);
      return true;
    });
    const result = await account.labelled("Gas sizing", async () => {
      await account.signTransaction(tx);
      return 42;
    });
    expect(result).toBe(42);
    await account.signTransaction(tx);
    expect(summaries[0]).toContain("Gas sizing");
    expect(summaries[1]).not.toContain("Gas sizing");
  });

  it("confirms the provisional transaction before it is signed", async () => {
    const label =
      "Provisional transaction for gas sizing, sent to http://127.0.0.1:8545 only";
    const events: string[] = [];
    // The frame serializer is Task 6's: here it only records when the
    // signature would be serialized, i.e. after the key has signed.
    const serializer = (_: unknown, signature?: unknown) => {
      events.push(signature ? "signed" : "serialized");
      return "0x00" as const;
    };
    const account = confirmingAccount(base, async (summary) => {
      events.push(`confirm: ${summary}`);
      return false;
    });
    await expect(
      account.labelled(label, () =>
        account.signTransaction(frameTx as any, { serializer } as any),
      ),
    ).rejects.toThrow("Not signed");
    expect(events).toHaveLength(1);
    expect(events[0]).toContain(label);
    expect(events[0]).toContain("frame");
  });

  it("describeSignature renders an ordinary transaction", () => {
    const text = describeSignature({ type: "transaction", transaction: tx });
    expect(text).toContain("Ethereum");
    expect(text).toContain("0x1111111111111111111111111111111111111111");
    expect(text).toContain("1.5 ETH");
    expect(text).toContain("0xa9059cbb");
    expect(text).toContain("68 bytes");
    expect(text).not.toContain("1500000000000000000");
  });

  it("describeSignature renders every frame", () => {
    const text = describeSignature({
      type: "transaction",
      transaction: frameTx as any,
      label: "Provisional",
    });
    expect(text).toContain("Provisional");
    expect(text).toContain("frame transaction");
    const lines = text.split("\n");
    const frame = (i: number) =>
      lines.find((l) => l.includes(`Frame ${i}:`)) ?? "";
    expect(frame(0)).toContain("VERIFY");
    expect(frame(0)).toContain("approves payment and execution");
    expect(frame(0)).toContain("sender");
    expect(frame(0)).toContain("0x12345678");
    expect(frame(0)).toContain("50000");
    expect(frame(1)).toContain("SENDER");
    expect(frame(1)).toContain("atomic");
    expect(frame(1)).toContain("0x1111111111111111111111111111111111111111");
    expect(frame(1)).toContain("2 ETH");
    expect(frame(1)).toContain("0xa9059cbb");
    expect(frame(1)).toContain("100000");
    expect(frame(1)).toContain("20000");
    expect(frame(2)).toContain("DEFAULT");
    expect(frame(2)).toContain("0x3333333333333333333333333333333333333333");
    expect(text).not.toContain(KEY.slice(2));
  });

  it("describeSignature shows the whole typed-data domain and message", () => {
    const text = describeSignature({
      type: "typedData",
      typedData: {
        domain: {
          name: "Permit2",
          version: "1",
          chainId: 1,
          verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
          salt: `0x${"ab".repeat(32)}`,
        },
        types: {
          PermitSingle: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint160" },
          ],
        },
        primaryType: "PermitSingle",
        message: {
          spender: "0x1111111111111111111111111111111111111111",
          amount: 5n,
        },
      },
    });
    expect(text).toContain("PermitSingle");
    expect(text).toContain('"Permit2"');
    expect(text).toContain('"1"');
    expect(text).toContain("Ethereum");
    expect(text).toContain("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    expect(text).toContain("ab".repeat(32));
    expect(text).toContain("PermitSingle(address spender, uint160 amount)");
    expect(text).toContain(
      'spender: "0x1111111111111111111111111111111111111111"',
    );
    expect(text).toContain('amount: "5"');
  });

  it("describeSignature shows raw byte messages as hex", () => {
    const text = describeSignature({
      type: "message",
      message: { raw: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
    });
    expect(text).toContain("0xdeadbeef");
  });

  it("escapes control characters in every field", () => {
    const attack = "\x1b[2K\rSafe\nline\u009b\u202e";
    for (const text of [
      describeSignature({ type: "message", message: attack }),
      describeSignature({ type: "message", message: "x", label: attack }),
      describeSignature({
        type: "typedData",
        typedData: {
          domain: { name: attack, version: attack },
          types: { [attack]: [{ name: "note", type: "string" }] },
          primaryType: attack,
          message: { note: attack },
        },
      }),
      describeSignature({
        type: "transaction",
        transaction: { chainId: 1, to: attack as any, value: 0n, data: "0x" },
      }),
    ]) {
      expect(text).not.toMatch(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
        /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202e]/,
      );
      // The only raw line breaks are the summary's own.
      for (const line of text.split("\n")) expect(line).not.toContain("\r");
      expect(text).toMatch(/\\x1b\[2K\\rSafe|\\u001b\[2K\\rSafe/);
    }
    expect(printable("\x1b[2K\rSafe")).toBe("\\x1b[2K\\rSafe");
  });

  describe("typed data is shown exactly as it is signed", () => {
    const permit = {
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 1,
        verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: base.address,
        spender: "0x1111111111111111111111111111111111111111",
        value: 1000000n,
        nonce: 0n,
        deadline: 1999999999n,
      },
    } as const;

    function account() {
      const summaries: string[] = [];
      return {
        summaries,
        signer: confirmingAccount(base, async (summary) => {
          summaries.push(summary);
          return true;
        }),
      };
    }

    it("refuses a domain key outside an explicit EIP712Domain type before confirm", async () => {
      const { signer, summaries } = account();
      await expect(
        signer.signTypedData({
          ...permit,
          types: {
            ...permit.types,
            EIP712Domain: [{ name: "name", type: "string" }],
          },
        } as any),
      ).rejects.toThrow(
        "Not signed: domain fields not in its EIP712Domain type: version, chainId, verifyingContract",
      );
      expect(summaries).toEqual([]);
    });

    it("refuses a message field its struct does not define", async () => {
      const { signer, summaries } = account();
      await expect(
        signer.signTypedData({
          ...permit,
          message: { ...permit.message, note: "not hashed" },
        } as any),
      ).rejects.toThrow("Not signed: message fields not in Permit: note");
      const nested = {
        domain: { name: "Mail" },
        types: {
          Mail: [{ name: "to", type: "Person[]" }],
          Person: [{ name: "wallet", type: "address" }],
        },
        primaryType: "Mail",
        message: {
          to: [{ wallet: base.address, name: "Bob" }],
        },
      };
      await expect(signer.signTypedData(nested as any)).rejects.toThrow(
        "Not signed: message fields not in Mail: to[0].name",
      );
      expect(summaries).toEqual([]);
    });

    it("shows a well-formed Permit's struct and fields, then signs it", async () => {
      const { signer, summaries } = account();
      const signature = await signer.signTypedData(permit);
      expect(await recoverTypedDataAddress({ ...permit, signature })).toBe(
        base.address,
      );
      const text = summaries[0];
      expect(text).toContain("Sign typed data Permit");
      expect(text).toContain(
        "Permit(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)",
      );
      expect(text).toContain('name (string): "USD Coin"');
      expect(text).toContain('version (string): "2"');
      expect(text).toContain("chainId (uint256): Ethereum (1)");
      expect(text).toContain(
        'verifyingContract (address): "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"',
      );
      expect(text).toContain('value: "1000000"');
      expect(text).toContain('deadline: "1999999999"');
    });

    it("shows a non-numeric chainId as it is", () => {
      const text = describeSignature({
        type: "typedData",
        typedData: {
          ...permit,
          domain: { chainId: "main\x1bnet" as any },
          types: {
            ...permit.types,
            EIP712Domain: [{ name: "chainId", type: "uint256" }],
          },
        },
      });
      expect(text).toContain('chainId (uint256): "main\\u001bnet"');
      expect(text).not.toContain("NaN");
    });
  });
});
