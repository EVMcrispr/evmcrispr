import { describe, expect, test } from "bun:test";
import {
  createWalletClient,
  custom,
  type Hex,
  parseEther,
  parseTransaction,
  recoverMessageAddress,
  recoverTypedDataAddress,
  stringToHex,
} from "viem";
import {
  createTestWallet,
  isLoopbackUrl,
  type SigningRequest,
  type TestWalletChain,
  testAccounts,
} from "../../src";

const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TO = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";

/** A local node: answers what filling and sending a transaction asks. */
function node(id = 31337) {
  const calls: { method: string; params: any }[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return `0x${id.toString(16)}`;
        case "eth_getTransactionCount":
          return "0x5";
        case "eth_estimateGas":
          return "0x5208";
        case "eth_getBlockByNumber":
          return {
            number: "0x1",
            hash: `0x${"11".repeat(32)}`,
            baseFeePerGas: "0x3b9aca00",
            timestamp: "0x1",
            transactions: [],
          };
        case "eth_maxPriorityFeePerGas":
          return "0x1";
        case "eth_sendRawTransaction":
          return `0x${"ab".repeat(32)}`;
        case "eth_getCode":
          return "0x";
        case "eth_blockNumber":
          return "0x1";
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls };
}

const chain = (
  over: Partial<TestWalletChain> = {},
  n = node(over.id),
): TestWalletChain => ({
  id: 31337,
  name: "Anvil",
  rpcUrl: "http://127.0.0.1:8545",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  transport: n.transport,
  ...over,
});

/** A wallet whose host approves (or not) and records what it was shown. */
function wallet({
  approve = true,
  chains = [chain()],
}: {
  approve?: boolean;
  chains?: TestWalletChain[];
} = {}) {
  const shown: SigningRequest[] = [];
  const w = createTestWallet({
    chains,
    approve: async (request) => {
      shown.push(request);
      return approve;
    },
  });
  const request = (method: string, params?: unknown[]) =>
    w.provider.request({ method, params } as never) as Promise<any>;
  return { ...w, shown, request };
}

describe("the test wallet's accounts and chains", () => {
  test("anvil's accounts, in index order", () => {
    const accounts = testAccounts();
    expect(accounts).toHaveLength(10);
    expect(accounts[0]!.address).toBe(ANVIL_0);
    expect(accounts[1]!.address).toBe(ANVIL_1);
  });

  test("loopback RPCs only", () => {
    for (const url of [
      "http://127.0.0.1:8545",
      "http://localhost:8570",
      "http://[::1]:8545",
    ])
      expect(isLoopbackUrl(url)).toBe(true);
    for (const url of [
      "https://altmempoolgateway.forshtat.com/rpc",
      "http://127.0.0.1.example.com",
      "not a url",
    ])
      expect(isLoopbackUrl(url)).toBe(false);
  });

  test("eth_accounts, eth_chainId, and a switch of account", async () => {
    const w = wallet();
    expect(await w.request("eth_requestAccounts")).toEqual([ANVIL_0]);
    expect(await w.request("eth_chainId")).toBe("0x7a69");
    const changed: unknown[] = [];
    w.provider.on("accountsChanged", (a: unknown) => changed.push(a));
    w.selectAccount(1);
    expect(changed).toEqual([[ANVIL_1]]);
    expect(await w.request("eth_accounts")).toEqual([ANVIL_1]);
  });

  test("switches to a loopback chain, refuses another, and an unknown one is 4902", async () => {
    const gateway = chain({
      id: 1337,
      name: "Alt-mempool devnet",
      rpcUrl: "https://altmempoolgateway.forshtat.com/rpc",
    });
    const w = wallet({
      chains: [
        chain(),
        chain({
          id: 81411,
          name: "Frames quick devnet",
          rpcUrl: "http://127.0.0.1:8570",
        }),
        gateway,
      ],
    });
    const changed: unknown[] = [];
    w.provider.on("chainChanged", (id: unknown) => changed.push(id));
    await w.request("wallet_switchEthereumChain", [{ chainId: "0x13e03" }]);
    expect(await w.request("eth_chainId")).toBe("0x13e03");
    expect(changed).toEqual(["0x13e03"]);
    await expect(
      w.request("wallet_switchEthereumChain", [{ chainId: "0x539" }]),
    ).rejects.toThrow(
      "The test wallet serves local chains only: the Alt-mempool devnet's RPC is not on this machine",
    );
    const unknown = await w
      .request("wallet_switchEthereumChain", [{ chainId: "0x1" }])
      .catch((e: { code: number }) => e);
    expect(unknown.code).toBe(4902);
  });

  test("eth_sign is refused: a bare hash cannot be shown", async () => {
    const w = wallet();
    await expect(
      w.request("eth_sign", [ANVIL_0, `0x${"00".repeat(32)}`]),
    ).rejects.toThrow("eth_sign");
    expect(w.shown).toHaveLength(0);
  });
});

describe("the test wallet's signing requests", () => {
  test("eth_sendTransaction: shown filled in, signed on Approve, sent to the chain's RPC", async () => {
    const n = node();
    const w = wallet({ chains: [chain({}, n)] });
    const hash = await w.request("eth_sendTransaction", [
      { from: ANVIL_0, to: TO, value: "0xde0b6b3a7640000", data: "0x" },
    ]);
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0]).toMatchObject({
      kind: "transaction",
      chain: { id: 31337, name: "Anvil" },
      from: ANVIL_0,
      to: TO,
      deployment: false,
      value: parseEther("1"),
      valueShown: "1 ETH",
      nonce: 5,
      gas: 21_000n,
    });
    const sent = n.calls.find((c) => c.method === "eth_sendRawTransaction")!;
    const tx = parseTransaction(sent.params[0] as Hex);
    expect(tx.to?.toLowerCase()).toBe(TO.toLowerCase());
    expect(tx.value).toBe(parseEther("1"));
  });

  test("Reject answers 4001 and signs nothing", async () => {
    const n = node();
    const w = wallet({ approve: false, chains: [chain({}, n)] });
    const error = await w
      .request("eth_sendTransaction", [{ from: ANVIL_0, to: TO, value: "0x1" }])
      .catch((e: { code: number }) => e);
    expect(error.code).toBe(4001);
    expect(n.calls.some((c) => c.method === "eth_sendRawTransaction")).toBe(
      false,
    );
  });

  test("a request from another account than the selected one is refused", async () => {
    const w = wallet();
    await expect(
      w.request("eth_sendTransaction", [{ from: ANVIL_1, to: TO }]),
    ).rejects.toThrow(`is not the selected account ${ANVIL_0}`);
    expect(w.shown).toHaveLength(0);
  });

  test("a deployment is shown as one, and its address is remembered", async () => {
    const w = wallet();
    await w.request("eth_sendTransaction", [
      { from: ANVIL_0, data: "0x6080604052" },
    ]);
    expect(w.shown[0]).toMatchObject({ kind: "transaction", deployment: true });
    expect(w.deployed(31337)).toEqual([
      "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    ]);
  });

  test("on a chain whose RPC is not local, nothing is shown or signed", async () => {
    const w = wallet({
      chains: [
        chain({
          id: 1337,
          name: "Alt-mempool devnet",
          rpcUrl: "https://altmempoolgateway.forshtat.com/rpc",
        }),
      ],
    });
    await expect(
      w.request("personal_sign", [stringToHex("hi"), ANVIL_0]),
    ).rejects.toThrow("not on this machine");
    expect(w.shown).toHaveLength(0);
  });

  test("personal_sign: the text when it is text", async () => {
    const w = wallet();
    const signature = await w.request("personal_sign", [
      stringToHex("Sign in to EVMcrispr"),
      ANVIL_0,
    ]);
    expect(w.shown[0]).toMatchObject({
      kind: "message",
      text: "Sign in to EVMcrispr",
    });
    expect(
      await recoverMessageAddress({
        message: "Sign in to EVMcrispr",
        signature,
      }),
    ).toBe(ANVIL_0);
    await w.request("personal_sign", ["0x00ff01", ANVIL_0]);
    expect(w.shown[1]).toMatchObject({ kind: "message", text: undefined });
  });

  test("eth_signTypedData_v4: the domain and every field", async () => {
    const w = wallet();
    const typed = {
      domain: {
        name: "EVMcrispr Frame Account",
        version: "1",
        chainId: 31337,
        verifyingContract: TO,
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        FrameTransaction: [{ name: "sigHash", type: "bytes32" }],
      },
      primaryType: "FrameTransaction",
      message: { sigHash: `0x${"cd".repeat(32)}` },
    };
    const signature = await w.request("eth_signTypedData_v4", [
      ANVIL_0,
      JSON.stringify(typed),
    ]);
    expect(w.shown[0]).toMatchObject({
      kind: "typed-data",
      primaryType: "FrameTransaction",
      domain: { name: "EVMcrispr Frame Account", chainId: 31337 },
      fields: [
        { name: "sigHash", type: "bytes32", shown: `0x${"cd".repeat(32)}` },
      ],
    });
    const { EIP712Domain: _, ...types } = typed.types;
    expect(
      await recoverTypedDataAddress({
        ...typed,
        types,
        primaryType: "FrameTransaction",
        signature,
      } as never),
    ).toBe(ANVIL_0);
  });

  test("works as a viem wallet's transport", async () => {
    const w = wallet();
    const client = createWalletClient({
      account: ANVIL_0,
      transport: custom(w.provider),
    });
    await client.signMessage({ message: "hello" });
    expect(w.shown[0]).toMatchObject({ kind: "message", text: "hello" });
  });

  test("only reads go to the RPC: anvil's own signing methods are refused", async () => {
    const n = node();
    const w = wallet({ chains: [chain({}, n)] });
    expect(await w.request("eth_blockNumber")).toBe("0x1");
    for (const method of [
      "eth_sendUnsignedTransaction",
      "anvil_setBalance",
      "eth_sendRawTransaction",
    ])
      await expect(w.request(method, [{}])).rejects.toMatchObject({
        code: 4200,
      });
    expect(n.calls.map((c) => c.method)).toEqual(["eth_blockNumber"]);
  });

  test("typed data for another chain than the wallet's is refused", async () => {
    const w = wallet();
    const typed = {
      domain: { name: "USD Coin", version: "2", chainId: 1 },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
        ],
        Permit: [{ name: "value", type: "uint256" }],
      },
      primaryType: "Permit",
      message: { value: "1" },
    };
    await expect(
      w.request("eth_signTypedData_v4", [ANVIL_0, JSON.stringify(typed)]),
    ).rejects.toThrow("is for chain 1, not the Anvil, which the wallet is on");
    expect(w.shown).toHaveLength(0);
  });

  test("a transaction for another chain is refused", async () => {
    const w = wallet();
    await expect(
      w.request("eth_sendTransaction", [
        { from: ANVIL_0, to: TO, chainId: "0x64" },
      ]),
    ).rejects.toThrow("is for chain 100, not the Anvil");
    expect(w.shown).toHaveLength(0);
  });

  test("malformed fields are refused, not read as something else", async () => {
    const w = wallet();
    for (const [field, value] of [
      ["to", "0x123"],
      ["value", "1000"],
      ["data", "hello"],
    ] as const)
      await expect(
        w.request("eth_sendTransaction", [
          { from: ANVIL_0, to: TO, [field]: value },
        ]),
      ).rejects.toMatchObject({ code: -32602 });
    // EIP-1474's `input` is the same field as `data`.
    await w.request("eth_sendTransaction", [
      { from: ANVIL_0, to: TO, input: "0xd09de08a" },
    ]);
    expect(w.shown[0]).toMatchObject({ call: { selector: "0xd09de08a" } });
  });
});
