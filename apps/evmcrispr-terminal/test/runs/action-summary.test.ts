import { describe, expect, test } from "bun:test";
import type { Action, SmartBatchAction } from "@evmcrispr/sdk";
import { hashTypedData, stringToHex } from "viem";
import { actionSummary, normaliseAction } from "../../src/runs/action-summary";

// The burn address and viem's zero-padded test spender: checksummed,
// never called.
const to = "0x000000000000000000000000000000000000dEaD" as const;
const spender = "0x1111111111111111111111111111111111111111" as const;
const UNLIMITED = `0x095ea7b3${"0".repeat(24)}${spender.slice(2)}${"f".repeat(64)}`;
const transfer = `0xa9059cbb${"0".repeat(24)}${spender.slice(2)}${"0".repeat(63)}1`;

describe("a transaction", () => {
  test("shows the function and the value, both, with the whole target and calldata", () => {
    const d = actionSummary({
      to,
      data: transfer as `0x${string}`,
      value: 10n ** 18n,
      chainId: 1,
    });
    expect(d.title).toBe("Contract call");
    expect(d.chainId).toBe(1);
    expect(d.calls).toEqual([
      {
        title: "Contract call",
        to,
        chainId: 1,
        value: "1 ETH",
        wei: "1000000000000000000",
        selector: "0xa9059cbb",
        data: transfer,
        delegatecall: false,
        warnings: [],
      },
    ]);
    // The one-line form names both too.
    expect(d.meta).toContain("0xa9059cbb");
    expect(d.meta).toContain("1 ETH");
    expect(d.detail).toBe(to);
  });

  test("two calls with the same selector differ by their calldata", () => {
    const other = `${transfer.slice(0, -1)}2` as `0x${string}`;
    const [a] = actionSummary({ to, data: transfer as `0x${string}` }).calls;
    const [b] = actionSummary({ to, data: other }).calls;
    expect(a.selector).toBe(b.selector);
    expect(a.data).not.toBe(b.data);
  });

  test("the value is in the chain's own currency, never a wrong one", () => {
    const value = (chainId?: number) =>
      actionSummary({ to, value: 2n * 10n ** 18n, chainId }).calls[0].value;
    expect(value(100)).toBe("2 XDAI");
    expect(value(137)).toBe("2 POL");
    expect(value(987654321)).toBe("2 native token");
    expect(value(undefined)).toBe("2 native token");
  });

  test("the value is counted in wei, whatever decimals a chain definition claims", () => {
    const sixDecimals = () =>
      ({
        id: 5,
        name: "Six",
        nativeCurrency: { symbol: "SIX", decimals: 6 },
      }) as never;
    const [call] = actionSummary(
      { to, value: 10n ** 18n, chainId: 5 },
      sixDecimals,
    ).calls;
    expect(call.value).toBe("1 SIX");
    expect(call.wei).toBe("1000000000000000000");
  });

  test("an operator approval and a raised allowance warn too", () => {
    const word = (hex: string) => hex.padStart(64, "0");
    const all = `0xa22cb465${word(spender.slice(2))}${word("1")}`;
    const none = `0xa22cb465${word(spender.slice(2))}${word("0")}`;
    const more = `0x39509351${word(spender.slice(2))}${word("5")}`;
    const warnings = (data: string) =>
      actionSummary({ to, data: data as `0x${string}` }).calls[0].warnings;
    expect(warnings(all)[0]).toContain("every token");
    expect(warnings(none)).toEqual([]);
    expect(warnings(more)[0]).toContain("allowance");
  });

  test("a transfer, a deployment and a delegatecall say what they are", () => {
    expect(actionSummary({ to, value: 1n, chainId: 1 }).calls[0]).toMatchObject(
      {
        title: "Native transfer",
        selector: undefined,
        data: "0x",
      },
    );
    const deploy = actionSummary({ data: "0x6080", chainId: 1 }).calls[0];
    expect(deploy).toMatchObject({
      title: "Contract deployment",
      to: undefined,
    });
    const delegate = actionSummary({ to, data: "0x12345678", operation: 1 });
    expect(delegate.calls[0].delegatecall).toBe(true);
    expect(delegate.calls[0].warnings[0]).toContain("delegatecall");
  });
});

describe("a batch", () => {
  const batch: Action = {
    type: "batched",
    chainId: 100,
    from: to,
    actions: [
      { to, data: transfer as `0x${string}` },
      { to: spender, data: UNLIMITED as `0x${string}` },
      ...Array.from({ length: 30 }, () => ({ to, value: 1n })),
    ],
  };

  test("lists every call, on the batch's chain", () => {
    const d = actionSummary(batch);
    expect(d.calls).toHaveLength(32);
    expect(d.calls.every((call) => call.chainId === 100)).toBe(true);
    expect(d.calls[2].value).toBe("0.000000000000000001 XDAI");
  });

  test("a call that names another chain than its batch says so", () => {
    const d = actionSummary({
      type: "batched",
      chainId: 100,
      from: to,
      actions: [{ to, value: 1n, chainId: 1 }],
    });
    expect(d.calls[0].chainId).toBe(100);
    expect(d.calls[0].warnings[0]).toContain("Ethereum");
    expect(d.calls[0].warnings[0]).toContain("Gnosis");
  });

  test("an approval inside it warns, on its own call and on the whole", () => {
    const d = actionSummary(batch);
    expect(d.calls[0].warnings).toEqual([]);
    expect(d.calls[1].warnings).toEqual([
      "This approval may grant unlimited token spending.",
    ]);
    expect(d.warning).toContain("unlimited token spending");
  });
});

describe("a wallet request", () => {
  const sign = (method: string, params: unknown[]): Action => ({
    type: "wallet",
    method,
    params,
  });
  const permit = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: to,
    },
    primaryType: "Permit",
    message: {
      owner: to,
      spender,
      value:
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      nonce: 0,
      deadline: 1900000000,
    },
  };
  const typed = (payload: unknown, method = "eth_signTypedData_v4") => {
    const d = actionSummary(normaliseAction(sign(method, [to, payload])));
    return d;
  };
  const raw = (d: ReturnType<typeof actionSummary>) => {
    expect(d.signing?.kind).toBe("raw");
    expect(d.notes.join(" ")).toMatch(
      /cannot be described|cannot say|as it will be sent/,
    );
  };

  test("a message to sign is shown as its text, from where the method puts it", () => {
    const hex = stringToHex("Sign in to example.org\nNonce 7");
    const d = actionSummary(sign("personal_sign", [hex, to]));
    expect(d.title).toBe("Sign a message");
    expect(d.signing).toEqual({
      kind: "message",
      text: "Sign in to example.org\nNonce 7",
      hex,
    });
  });

  test("a message the size of an address is still the first parameter", () => {
    const d = actionSummary(sign("personal_sign", [spender, to]));
    expect(d.signing).toMatchObject({ kind: "message", hex: spender });
    expect(d.notes.join(" ")).toContain("size of an address");
  });

  test("parameters in another order are not guessed at: the request is shown raw", () => {
    raw(actionSummary(sign("personal_sign", [to, stringToHex("hello")])));
    raw(actionSummary(sign("personal_sign", [stringToHex("hello")])));
    raw(actionSummary(sign("personal_sign", ["hello", to])));
  });

  test("bytes that are not text are shown as they are, and said to be so", () => {
    const d = actionSummary(sign("personal_sign", ["0xff00fe", to]));
    expect(d.signing).toEqual({ kind: "message", hex: "0xff00fe" });
    expect(d.notes.join(" ")).toContain("not text");
  });

  test("characters that hide or reorder text are written out, with a warning", () => {
    const dressed = "pay 100\u202E to bob\u200B";
    const d = actionSummary(sign("personal_sign", [stringToHex(dressed), to]));
    if (d.signing?.kind !== "message") throw new Error("expected a message");
    expect(d.signing.text).toBe("pay 100\\u{202E} to bob\\u{200B}");
    expect(d.signing.hex).toBe(stringToHex(dressed));
    expect(d.warning).toContain("do not show");
  });

  test("a typed-data permit shows who may spend and how much, as its type declares", () => {
    for (const payload of [JSON.stringify(permit), permit]) {
      const d = typed(payload);
      expect(d.title).toBe("Sign typed data");
      if (d.signing?.kind !== "typed") throw new Error("expected typed data");
      expect(d.signing.primaryType).toBe("Permit");
      expect(d.signing.domain).toEqual([
        ["name", "string", "USD Coin"],
        ["version", "string", "2"],
        ["chainId", "uint256", "1"],
        ["verifyingContract", "address", to],
      ]);
      expect(d.signing.message).toContainEqual(["spender", "address", spender]);
      expect(d.signing.message).toContainEqual([
        "value",
        "uint256",
        permit.message.value,
      ]);
      // The hash a hardware wallet shows.
      expect(d.signing.hash).toBe(hashTypedData(permit as never));
      expect(JSON.parse(d.signing.raw)).toEqual(permit);
      expect(d.notes).toEqual([]);
    }
  });

  test("what is described is the very value that is sent", () => {
    const sent = normaliseAction(sign("eth_signTypedData_v4", [to, permit]));
    if (!("type" in sent) || sent.type !== "wallet") throw new Error("wallet");
    const d = actionSummary(sent);
    if (d.signing?.kind !== "typed") throw new Error("expected typed data");
    expect(typeof sent.params[1]).toBe("string");
    expect(d.signing.raw).toBe(
      JSON.stringify(JSON.parse(sent.params[1]), null, 2),
    );
  });

  test("a JSON string with a duplicate key is sent as this page read it", () => {
    const twice = JSON.stringify(permit).replace(
      `"spender":"${spender}"`,
      `"spender":"${spender}","spender":"${to}"`,
    );
    const sent = normaliseAction(sign("eth_signTypedData_v4", [to, twice]));
    if (!("type" in sent) || sent.type !== "wallet") throw new Error("wallet");
    // One reading only: the wallet receives a text that has it once.
    expect(sent.params[1].match(/"spender":/g)).toHaveLength(1);
    const d = actionSummary(sent);
    if (d.signing?.kind !== "typed") throw new Error("expected typed data");
    expect(d.signing.message).toContainEqual(["spender", "address", to]);
    expect(JSON.parse(sent.params[1]).message.spender).toBe(to);
  });

  test("a field the type does not declare is not shown as signed, and is pointed out", () => {
    const d = typed({
      ...permit,
      message: { ...permit.message, recipient: spender },
      domain: { ...permit.domain, salt: "0x01" },
    });
    if (d.signing?.kind !== "typed") throw new Error("expected typed data");
    expect(d.signing.message.map(([path]) => path)).not.toContain("recipient");
    expect(d.notes.join(" ")).toContain('"recipient"');
    expect(d.notes.join(" ")).toContain('"domain.salt"');
    expect(d.notes.join(" ")).toContain("not part of what is signed");
  });

  test("nested typed data shows every encoded field by its path, with its type", () => {
    const d = typed({
      types: {
        Order: [
          { name: "maker", type: "Party" },
          { name: "items", type: "uint256[]" },
        ],
        Party: [{ name: "wallet", type: "address" }],
      },
      domain: {},
      primaryType: "Order",
      message: { maker: { wallet: to }, items: [1, 2] },
    });
    if (d.signing?.kind !== "typed") throw new Error("expected typed data");
    expect(d.signing.message).toEqual([
      ["maker.wallet", "address", to],
      ["items.0", "uint256", "1"],
      ["items.1", "uint256", "2"],
    ]);
  });

  test("typed data that cannot be read as its method defines is shown raw, and says so", () => {
    const { deadline: _, ...short } = permit.message;
    raw(typed({ ...permit, message: short })); // a declared field is missing
    raw(typed({ ...permit, types: { Permit: "nonsense" } }));
    raw(typed({ ...permit, types: undefined }));
    raw(typed({ ...permit, primaryType: "Other" }));
    raw(typed("{not json"));
    raw(typed({ no: "message" }));
    // The legacy form: an array, in first position.
    raw(
      actionSummary(
        normaliseAction(
          sign("eth_signTypedData", [
            [{ type: "string", name: "msg", value: "hi" }],
            to,
          ]),
        ),
      ),
    );
    raw(typed(permit, "eth_signTypedData_v1"));
  });

  test("any other request is shown raw, and says so", () => {
    for (const request of [
      sign("wallet_somethingNew", [{ a: 1n }]),
      sign("eth_sign", [to, `0x${"ab".repeat(32)}`]),
    ]) {
      const d = actionSummary(request);
      raw(d);
      // Raw means the whole request, as it will be sent.
      if (d.signing?.kind === "raw")
        expect(JSON.parse(d.signing.raw)).toEqual(
          JSON.parse(
            JSON.stringify(
              (request as { params: unknown[] }).params,
              (_k, v) => (typeof v === "bigint" ? v.toString() : v),
            ),
          ),
        );
    }
  });

  test("a change of chain says which chain", () => {
    const d = actionSummary(
      sign("wallet_switchEthereumChain", [{ chainId: "0x64" }]),
    );
    expect(d).toMatchObject({ title: "Switch network", detail: "Gnosis" });
    expect(d.signing).toBeUndefined();
  });
});

describe("a smart batch", () => {
  const smart: SmartBatchAction = {
    type: "smartBatch",
    chainId: 100,
    from: to,
    plan: {
      version: 1,
      salt: "0x00",
      chainId: 100,
      account: to,
      route: "executor",
      executor: spender,
      storage: spender,
      captures: [],
      dependencies: [],
      steps: [
        {
          kind: "transaction",
          label: "approve",
          action: { to: spender, data: UNLIMITED as `0x${string}` },
        },
        {
          kind: "composable",
          label: "swap what was received",
          execution: {} as never,
          dynamicFields: ["amount"],
        },
      ],
    },
  };

  test("lists its steps: the fixed ones in full, the others as resolved at execution", () => {
    const d = actionSummary(smart);
    expect(d.title).toBe("Atomic smart batch");
    expect(d.steps).toHaveLength(2);
    expect(d.steps?.[0]).toMatchObject({
      label: "approve",
      call: { to: spender, selector: "0x095ea7b3", chainId: 100 },
    });
    expect(d.steps?.[0].call?.warnings).toHaveLength(1);
    expect(d.steps?.[1]).toMatchObject({ label: "swap what was received" });
    expect(d.steps?.[1].note).toContain("resolved at execution");
    expect(d.steps?.[1].note).toContain("amount");
    expect(d.warning).toContain("unlimited token spending");
    expect(d.notes.join(" ")).toContain("resolved during execution");
  });
});
