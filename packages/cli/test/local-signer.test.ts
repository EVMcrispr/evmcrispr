import { describe, expect, it } from "bun:test";
import {
  type Hex,
  parseTransaction,
  recoverAddress,
  recoverMessageAddress,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  type TransactionSerializable,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAuthorizationAddress } from "viem/utils";
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
  from: base.address,
  nonce: 0,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
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

  it("describeSignature shows the whole calldata, wrapped", () => {
    const text = describeSignature({ type: "transaction", transaction: tx });
    const lines = text.split("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(80);
    const data = tx.data as string;
    expect(text).toContain(`call:  ${data.slice(0, 10)} (68 bytes)`);
    // The arguments follow, one 32-byte word per line.
    const words = lines.slice(lines.findIndex((l) => l.includes("call:")) + 1);
    expect(words.slice(0, 2).map((l) => l.trim())).toEqual([
      data.slice(10, 74),
      data.slice(74),
    ]);
  });

  it("describeSignature shows an ordinary transaction's fees in gwei", () => {
    const text = describeSignature({
      type: "transaction",
      transaction: {
        ...tx,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_500_000_000n,
      },
    });
    expect(text).toContain("max fee:      30 gwei");
    expect(text).toContain("priority fee: 1.5 gwei");
  });

  it("describeSignature shows a frame transaction's fees and maximum cost", () => {
    const text = describeSignature({
      type: "transaction",
      transaction: frameTx as any,
    });
    expect(text).toContain("max fee:      2 gwei");
    expect(text).toContain("priority fee: 1 gwei");
    // (50,000 + 0 + 100,000 + 20,000 + 30,000 + 0) gas × 2 gwei.
    expect(text).toContain("max cost:     0.0004 ETH");
  });

  it("describeSignature shows the frame transaction's from, not another field", () => {
    const other = "0x9999999999999999999999999999999999999999";
    const text = describeSignature({
      type: "transaction",
      transaction: { ...frameTx, from: other } as any,
      account: base.address,
    });
    expect(text).toContain(`sender: ${other}`);
    const fallback = describeSignature({
      type: "transaction",
      transaction: { ...frameTx, from: undefined, sender: other } as any,
      account: base.address,
    });
    expect(fallback).toContain(`sender: ${base.address}`);
    expect(fallback).not.toContain(other);
  });

  it("asks one confirmation at a time", async () => {
    const events: string[] = [];
    const answers: ((ok: boolean) => void)[] = [];
    const account = confirmingAccount(
      base,
      (summary) =>
        new Promise<boolean>((resolve) => {
          events.push(`start ${summary.includes("first") ? 1 : 2}`);
          answers.push((ok) => {
            events.push(`end ${answers.length}`);
            resolve(ok);
          });
        }),
    );
    const first = account.signMessage({ message: "first" });
    const second = account.signMessage({ message: "second" });
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual(["start 1"]);
    answers[0]!(true);
    await first;
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual(["start 1", "end 1", "start 2"]);
    answers[1]!(true);
    await second;
  });

  it("a refused or failed confirmation does not block the next one", async () => {
    let calls = 0;
    const account = confirmingAccount(base, async () => {
      calls++;
      if (calls === 1) throw new Error("no terminal");
      return true;
    });
    await expect(account.signMessage({ message: "a" })).rejects.toThrow(
      "no terminal",
    );
    await account.signMessage({ message: "b" });
    expect(calls).toBe(2);
  });

  it("signs the raw hash and the authorization as shown, not as changed during the prompt", async () => {
    const asked = `0x${"11".repeat(32)}` as Hex;
    const args = { hash: asked };
    const authorization = {
      chainId: 1,
      address: "0x1111111111111111111111111111111111111111" as Hex,
      nonce: 3,
    };
    let change = () => {
      args.hash = `0x${"22".repeat(32)}`;
    };
    const summaries: string[] = [];
    const account = confirmingAccount(base, async (summary) => {
      summaries.push(summary);
      change();
      return true;
    });
    const signature = await account.sign!(args);
    expect(await recoverAddress({ hash: asked, signature })).toBe(base.address);
    expect(summaries[0]).toContain(asked);

    change = () => {
      authorization.address = "0x3333333333333333333333333333333333333333";
      authorization.nonce = 9;
    };
    const signed = await account.signAuthorization!(authorization);
    expect(signed.address).toBe("0x1111111111111111111111111111111111111111");
    expect(signed.nonce).toBe(3);
    expect(await recoverAuthorizationAddress({ authorization: signed })).toBe(
      base.address,
    );
  });

  it("refuses an authorization it cannot show as viem signs it, before confirm", async () => {
    let asked = 0;
    const account = confirmingAccount(base, async () => {
      asked++;
      return true;
    });
    const ok = {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 1,
      nonce: 3,
    } as const;
    for (const [authorization, reason] of [
      [
        {
          ...ok,
          contractAddress: "0x2222222222222222222222222222222222222222",
        },
        "address and contractAddress differ",
      ],
      [{ ...ok, chainId: -1 }, "chainId is not a non-negative integer"],
      [{ ...ok, nonce: 1.5 }, "nonce is not a non-negative integer"],
      [{ ...ok, address: "0x1234" }, "no valid delegate address"],
    ] as const)
      await expect(
        account.signAuthorization!(authorization as never),
      ).rejects.toThrow(reason);
    expect(asked).toBe(0);
  });

  it("refuses a transaction whose authorization list it cannot show as encoded, before confirm", async () => {
    let asked = 0;
    const account = confirmingAccount(base, async () => {
      asked++;
      return true;
    });
    const tx = {
      type: "eip7702",
      chainId: 1,
      nonce: 0,
      to: "0x1111111111111111111111111111111111111111",
      gas: 50_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    } as const;
    const entry = {
      address: "0x2222222222222222222222222222222222222222",
      chainId: 1,
      nonce: 0,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
      yParity: 0,
    } as const;
    for (const [list, reason] of [
      [
        [
          {
            ...entry,
            contractAddress: "0x3333333333333333333333333333333333333333",
          },
        ],
        "authorization 1: the authorization's address and contractAddress differ",
      ],
      [
        [{ ...entry, address: undefined, contractAddress: entry.address }],
        "authorization 1 has no address",
      ],
      [
        [entry, { ...entry, nonce: -1 }],
        "authorization 2: the authorization's nonce",
      ],
    ] as const)
      await expect(
        account.signTransaction({ ...tx, authorizationList: list } as never),
      ).rejects.toThrow(reason);
    expect(asked).toBe(0);
  });

  it("shows the delegate viem signs: contractAddress before address", async () => {
    const summaries: string[] = [];
    const account = confirmingAccount(base, async (summary) => {
      summaries.push(summary);
      return true;
    });
    await account.signAuthorization!({
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: 1,
      nonce: 3,
    } as never);
    expect(summaries[0]).toContain(
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("refuses a raw hash that is not 32 bytes of hex, before confirm", async () => {
    let asked = 0;
    const account = confirmingAccount(base, async () => {
      asked++;
      return true;
    });
    for (const hash of ["0x1234", `0x${"zz".repeat(32)}`, "11".repeat(32)])
      await expect(account.sign!({ hash: hash as Hex })).rejects.toThrow(
        "Not signed: the hash is not 32 bytes of 0x-prefixed hex",
      );
    expect(asked).toBe(0);
  });

  it("refuses calldata that is not hex of whole bytes, before confirm", async () => {
    let asked = 0;
    const account = confirmingAccount(base, async () => {
      asked++;
      return true;
    });
    for (const data of ["0xabc", "0xzz", "a9059cbb"]) {
      await expect(
        account.signTransaction({ ...tx, data: data as Hex }),
      ).rejects.toThrow(
        "Not signed: data is not 0x-prefixed hex of whole bytes",
      );
      await expect(
        account.signTransaction({ ...tx, data: undefined, input: data } as any),
      ).rejects.toThrow(
        "Not signed: input is not 0x-prefixed hex of whole bytes",
      );
      const frames = frameTx.frames.map((f, i) =>
        i === 1 ? { ...f, data } : f,
      );
      await expect(
        account.signTransaction({ ...frameTx, frames } as any),
      ).rejects.toThrow(
        "Not signed: frame 2's data is not 0x-prefixed hex of whole bytes",
      );
    }
    expect(asked).toBe(0);
  });

  it("describeSignature shows a frame transaction's nonce keys and signer", () => {
    const plain = describeSignature({
      type: "transaction",
      transaction: frameTx as any,
    });
    expect(plain).toContain("nonce keys: 0");
    expect(plain).toContain("signer: the sender (an account without code)");
    const keyed = describeSignature({
      type: "transaction",
      transaction: {
        ...frameTx,
        nonceKeys: [0n, 7n],
        signer: "0x4444444444444444444444444444444444444444",
      } as any,
    });
    expect(keyed).toContain("nonce keys: 0, 7");
    expect(keyed).toContain(
      "signer: 0x4444444444444444444444444444444444444444",
    );
  });

  it("describeSignature shows an ordinary transaction's access and authorization lists", () => {
    const text = describeSignature({
      type: "transaction",
      transaction: {
        ...tx,
        accessList: [
          {
            address: "0x5555555555555555555555555555555555555555",
            storageKeys: [`0x${"00".repeat(32)}`, `0x${"01".repeat(32)}`],
          },
        ],
        authorizationList: [
          {
            chainId: 1,
            address: "0x6666666666666666666666666666666666666666",
            nonce: 4,
            r: "0x01",
            s: "0x02",
            yParity: 0,
          },
        ],
      } as any,
    });
    expect(text).toContain("access list: 1 entry");
    expect(text).toContain(
      "0x5555555555555555555555555555555555555555 (2 storage keys)",
    );
    expect(text).toContain("authorizations: 1");
    expect(text).toContain(
      "delegate to 0x6666666666666666666666666666666666666666 on Ethereum, nonce 4",
    );
    expect(
      describeSignature({ type: "transaction", transaction: tx }),
    ).not.toMatch(/access list|authorizations/);
  });

  it("signs the request as it was shown, not as it is changed during the prompt", async () => {
    const shown = { ...tx } as TransactionSerializable & { to: Hex };
    const raw = new Uint8Array([1, 2, 3]);
    const typed = {
      domain: { name: "Notes" },
      types: { Note: [{ name: "text", type: "string" }] },
      primaryType: "Note" as const,
      message: { text: "as shown" },
    };
    let change = () => {
      shown.to = "0x3333333333333333333333333333333333333333";
      shown.value = 9n;
    };
    const account = confirmingAccount(base, async () => {
      change();
      return true;
    });
    const signed = await account.signTransaction(shown);
    const parsed = parseTransaction(signed as any);
    expect(parsed.to).toBe("0x1111111111111111111111111111111111111111");
    expect(parsed.value).toBe(1_500_000_000_000_000_000n);

    change = () => {
      raw[0] = 9;
    };
    const signature = await account.signMessage({ message: { raw } });
    expect(
      await recoverMessageAddress({
        message: { raw: new Uint8Array([1, 2, 3]) },
        signature,
      }),
    ).toBe(base.address);

    change = () => {
      typed.message.text = "changed";
    };
    const typedSignature = await account.signTypedData(typed);
    expect(
      await recoverTypedDataAddress({
        ...typed,
        message: { text: "as shown" },
        signature: typedSignature,
      }),
    ).toBe(base.address);
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
    expect(frame(1)).toContain("VERIFY");
    expect(frame(1)).toContain("approves payment and execution");
    expect(frame(1)).toContain("sender");
    expect(frame(1)).toContain("0x12345678");
    expect(frame(1)).toContain("50000");
    expect(frame(2)).toContain("SENDER");
    expect(frame(2)).toContain("atomic");
    expect(frame(2)).toContain("0x1111111111111111111111111111111111111111");
    expect(frame(2)).toContain("2 ETH");
    expect(frame(2)).toContain("0xa9059cbb");
    expect(frame(2)).toContain("100000");
    expect(frame(2)).toContain("20000");
    expect(frame(3)).toContain("DEFAULT");
    expect(frame(3)).toContain("0x3333333333333333333333333333333333333333");
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

    describe("refuses values viem would coerce, before confirm", () => {
      const coerced: [string, Record<string, unknown>, string][] = [
        [
          "a string field given a number",
          {
            types: { Note: [{ name: "text", type: "string" }] },
            message: { text: 42 },
          },
          "message.text (string) is not a string",
        ],
        [
          "bytes given non-hex text",
          {
            types: { Note: [{ name: "data", type: "bytes" }] },
            message: { data: "hello" },
          },
          "message.data (bytes) is not 0x-prefixed hex of whole bytes",
        ],
        [
          "bytes of odd length",
          {
            types: { Note: [{ name: "data", type: "bytes" }] },
            message: { data: "0xabc" },
          },
          "message.data (bytes) is not 0x-prefixed hex of whole bytes",
        ],
        [
          "bytes32 of the wrong length",
          {
            types: { Note: [{ name: "id", type: "bytes32" }] },
            message: { id: "0x1234" },
          },
          "message.id (bytes32) is not 0x-prefixed hex of 32 bytes",
        ],
        [
          'bool given "true"',
          {
            types: { Note: [{ name: "ok", type: "bool" }] },
            message: { ok: "true" },
          },
          "message.ok (bool) is not true or false",
        ],
        [
          "uint8 out of range",
          {
            types: { Note: [{ name: "n", type: "uint8" }] },
            message: { n: 256n },
          },
          "message.n (uint8) is out of range for uint8",
        ],
        [
          "a negative uint",
          {
            types: { Note: [{ name: "n", type: "uint256" }] },
            message: { n: -1 },
          },
          "message.n (uint256) is out of range for uint256",
        ],
        [
          "a uint given hex text",
          {
            types: { Note: [{ name: "n", type: "uint256" }] },
            message: { n: "0x10" },
          },
          "message.n (uint256) is not a bigint, safe integer or decimal string",
        ],
        [
          "a uint given an unsafe number",
          {
            types: { Note: [{ name: "n", type: "uint256" }] },
            message: { n: 2 ** 60 },
          },
          "message.n (uint256) is not a bigint, safe integer or decimal string",
        ],
        [
          "a bad address",
          {
            types: { Note: [{ name: "to", type: "address" }] },
            message: { to: "0x1234" },
          },
          "message.to (address) is not an address",
        ],
        [
          "a nested field in an array of structs",
          {
            types: {
              Note: [{ name: "people", type: "Person[]" }],
              Person: [{ name: "name", type: "string" }],
            },
            message: { people: [{ name: "Ann" }, { name: 7 }] },
          },
          "message.people[1].name (string) is not a string",
        ],
        [
          "a string with a lone surrogate",
          {
            types: { Note: [{ name: "text", type: "string" }] },
            message: { text: "a\uD800b" },
          },
          "message.text (string) is not well-formed Unicode",
        ],
        [
          "a domain field against its declared type",
          {
            domain: { name: "Notes", chainId: "0x1" },
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "chainId", type: "uint256" },
              ],
              Note: [{ name: "text", type: "string" }],
            },
            message: { text: "hi" },
          },
          "domain.chainId (uint256) is not a bigint, safe integer or decimal string",
        ],
      ];
      for (const [what, typed, reason] of coerced)
        it(what, async () => {
          const { signer, summaries } = account();
          await expect(
            signer.signTypedData({
              domain: { name: "Notes" },
              primaryType: "Note",
              ...typed,
            } as any),
          ).rejects.toThrow(`Not signed: ${reason}`);
          expect(summaries).toEqual([]);
        });

      it("signs decimal strings and safe integers as they read", async () => {
        const { signer, summaries } = account();
        const typed = {
          ...permit,
          message: { ...permit.message, value: "1000000", nonce: 0 },
        };
        const signature = await signer.signTypedData(typed as any);
        expect(await recoverTypedDataAddress({ ...permit, signature })).toBe(
          base.address,
        );
        expect(summaries).toHaveLength(1);
      });
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
