import { describe, expect, it } from "bun:test";
import { recoverTransactionAddress, type TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { confirmingAccount, describeSignature } from "../src/lib/local-signer";

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
});
