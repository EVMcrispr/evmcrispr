// The test wallet: an EIP-1193 provider over anvil's public accounts. Every
// signing request becomes a model the host shows (`approve`); nothing is
// signed unless the host says yes, and nothing at all on a chain whose RPC
// is not on this machine.
import {
  type Abi,
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  type EIP1193Provider,
  formatUnits,
  getAddress,
  getContractAddress,
  type Hex,
  hexToBigInt,
  hexToNumber,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  type PublicClient,
  type Transport,
} from "viem";
import type { HDAccount } from "viem/accounts";
import { testAccounts } from "./accounts";
import { type AbiFor, decodeCall, type Read } from "./decode";
import { TestWalletError } from "./errors";
import { signFrameRequest } from "./frames";
import { isLoopbackUrl } from "./loopback";
import type {
  ChainInfo,
  MessageRequestModel,
  SigningRequest,
  TransactionRequestModel,
  TypedDataField,
  TypedDataRequestModel,
} from "./model";

export interface TestWalletChain {
  id: number;
  name: string;
  /** Decides whether the wallet serves the chain: loopback only. */
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** The host's transport to that RPC (else `http(rpcUrl)`). */
  transport?: Transport;
}

/** Characters a message is not shown as text with: controls, and the
 *  bidi and zero-width marks that change how text reads. */
const HIDDEN: readonly [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const unshowable = (text: string) =>
  [...text].some((c) => {
    const n = c.codePointAt(0)!;
    return HIDDEN.some(([from, to]) => n >= from && n <= to);
  });

const REJECTED = 4001;
const UNAUTHORIZED = 4100;
const UNSUPPORTED = 4200;
const DISCONNECTED = 4901;
const UNKNOWN_CHAIN = 4902;
const INVALID = -32602;

/** What a dapp may read through the wallet; anything else that is not the
 *  wallet's own is refused (a local node signs for its unlocked accounts:
 *  `eth_sendUnsignedTransaction` would move funds without asking). */
const READS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_getProof",
  "eth_syncing",
  "net_version",
  "web3_clientVersion",
]);

type Listener = (...args: unknown[]) => void;

export interface TestWallet {
  provider: EIP1193Provider;
  accounts: readonly HDAccount[];
  account(): HDAccount;
  selectAccount(index: number): void;
  chainId(): number;
  /** The contracts this wallet deployed on a chain, oldest first. */
  deployed(chainId: number): Address[];
}

export function createTestWallet({
  chains,
  chainId,
  approve,
  abiFor,
  standards,
}: {
  chains: readonly TestWalletChain[];
  chainId?: number;
  /** Shows the request; true signs it, false answers 4001. */
  approve: (request: SigningRequest) => Promise<boolean>;
  /** ABIs the host vouches for (verified sources). */
  abiFor?: AbiFor;
  /** More ABIs to match by selector, named ("the frame account"). */
  standards?: readonly { name: string; abi: Abi }[];
}): TestWallet {
  const accounts = testAccounts();
  let index = 0;
  let current = chainId ?? chains[0]?.id ?? 31337;
  const listeners = new Map<string, Set<Listener>>();
  const deployments = new Map<number, Address[]>();
  const clients = new Map<number, PublicClient>();

  const emit = (event: string, ...args: unknown[]) => {
    for (const l of listeners.get(event) ?? []) l(...args);
  };
  const chainOf = (id: number) => chains.find((c) => c.id === id);
  const viemChain = (c: TestWalletChain): Chain =>
    defineChain({
      id: c.id,
      name: c.name,
      nativeCurrency: c.nativeCurrency,
      rpcUrls: { default: { http: [c.rpcUrl] } },
    });
  const transportOf = (c: TestWalletChain) => c.transport ?? http(c.rpcUrl);
  const clientOf = (c: TestWalletChain): PublicClient => {
    let client = clients.get(c.id);
    if (!client) {
      client = createPublicClient({
        chain: viemChain(c),
        transport: transportOf(c),
      }) as PublicClient;
      clients.set(c.id, client);
    }
    return client;
  };
  const refuseRemote = (c: TestWalletChain) => {
    if (!isLoopbackUrl(c.rpcUrl))
      throw new TestWalletError(
        DISCONNECTED,
        `The test wallet serves local chains only: the ${c.name}'s RPC is not on this machine`,
      );
  };
  /** The chain a signing request is for: the current one, if served. */
  const served = (): TestWalletChain => {
    const c = chainOf(current);
    if (!c)
      throw new TestWalletError(
        DISCONNECTED,
        "The test wallet is on a chain it does not know",
      );
    refuseRemote(c);
    return c;
  };
  const info = (c: TestWalletChain): ChainInfo => ({ id: c.id, name: c.name });
  const native = (c: TestWalletChain, value: bigint) =>
    `${formatUnits(value, c.nativeCurrency.decimals)} ${c.nativeCurrency.symbol}`;
  const readOn =
    (c: TestWalletChain): Read =>
    async (to, data) =>
      (
        await clientOf(c)
          .call({ to, data })
          .catch(() => undefined)
      )?.data;
  const labelOf = (chainId: number, address: Address | undefined) =>
    address &&
    (deployments.get(chainId) ?? []).some((d) => isAddressEqual(d, address))
      ? "deployed in this session"
      : undefined;

  /** The selected account, which `from` must be. */
  const signer = (from: unknown): HDAccount => {
    const account = accounts[index]!;
    if (from === undefined) return account;
    if (typeof from !== "string" || !isAddress(from, { strict: false }))
      throw new TestWalletError(
        UNAUTHORIZED,
        `${String(from)} is not an address`,
      );
    if (!isAddressEqual(from, account.address))
      throw new TestWalletError(
        UNAUTHORIZED,
        `${getAddress(from)} is not the selected account ${account.address}`,
      );
    return account;
  };
  const ask = async (request: SigningRequest) => {
    if (!(await approve(request)))
      throw new TestWalletError(
        REJECTED,
        "The request was rejected in the test wallet",
      );
  };

  async function transaction(
    method: "eth_sendTransaction" | "eth_signTransaction",
    params: unknown,
  ): Promise<Hex> {
    const c = served();
    const p = (params ?? {}) as Record<string, unknown>;
    const account = signer(p.from);
    const invalid = (what: string) =>
      new TestWalletError(
        INVALID,
        `The transaction's ${what}: nothing was signed`,
      );
    const q = (name: string) => {
      const v = p[name];
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v))
        throw invalid(`${name} is not a 0x quantity`);
      return hexToBigInt(v as Hex);
    };
    const requested = q("chainId");
    if (requested !== undefined && requested !== BigInt(c.id))
      throw invalid(
        `chainId is for chain ${requested}, not the ${c.name}, which the wallet is on`,
      );
    let to: Address | undefined;
    if (p.to !== undefined && p.to !== null) {
      if (typeof p.to !== "string" || !isAddress(p.to, { strict: false }))
        throw invalid("to is not an address");
      to = getAddress(p.to);
    }
    const rawData = p.data ?? p.input;
    if (
      rawData !== undefined &&
      rawData !== null &&
      (typeof rawData !== "string" || !isHex(rawData))
    )
      throw invalid("data is not hex");
    if (p.data !== undefined && p.input !== undefined && p.data !== p.input)
      throw invalid("data and input differ");
    const data = (rawData as Hex | undefined) ?? "0x";
    const wallet = createWalletClient({
      account,
      chain: viemChain(c),
      transport: transportOf(c),
    });
    const prepared = await wallet.prepareTransactionRequest({
      to,
      data,
      value: q("value") ?? 0n,
      gas: q("gas"),
      nonce: q("nonce") === undefined ? undefined : Number(q("nonce")),
      maxFeePerGas: q("maxFeePerGas"),
      maxPriorityFeePerGas: q("maxPriorityFeePerGas"),
    } as never);
    const prep = prepared as unknown as {
      gas: bigint;
      nonce: number;
      value?: bigint;
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
      gasPrice?: bigint;
    };
    const value = prep.value ?? 0n;
    const maxFee = prep.maxFeePerGas ?? prep.gasPrice ?? 0n;
    const model: TransactionRequestModel = {
      kind: "transaction",
      method,
      chain: info(c),
      from: account.address,
      to,
      toLabel: labelOf(c.id, to),
      deployment: to === undefined,
      value,
      valueShown: native(c, value),
      call: to
        ? await decodeCall(
            { chainId: c.id, to, data },
            { abiFor, read: readOn(c), standards },
          )
        : undefined,
      nonce: prep.nonce,
      gas: prep.gas,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: prep.maxPriorityFeePerGas ?? maxFee,
      maxCostShown: native(c, prep.gas * maxFee + value),
    };
    await ask(model);
    const raw = await account.signTransaction(prepared as never);
    if (method === "eth_signTransaction") return raw;
    const hash = await clientOf(c).sendRawTransaction({
      serializedTransaction: raw,
    });
    if (!to) {
      const created = getContractAddress({
        from: account.address,
        nonce: BigInt(prep.nonce),
      });
      deployments.set(c.id, [...(deployments.get(c.id) ?? []), created]);
    }
    return hash;
  }

  async function typedData(params: unknown[]): Promise<Hex> {
    const c = served();
    const account = signer(params[0]);
    const raw = params[1];
    const typed = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      domain?: TypedDataRequestModel["domain"] & { chainId?: number | string };
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    };
    const { EIP712Domain: _, ...types } = typed.types;
    const fields: TypedDataField[] = [];
    const walk = (type: string, value: unknown, path: string) => {
      const array = type.match(/^(.*)\[\d*\]$/);
      if (array && Array.isArray(value)) {
        value.forEach((v, i) => walk(array[1]!, v, `${path}[${i}]`));
        return;
      }
      const struct = types[type];
      if (struct && value && typeof value === "object") {
        for (const f of struct)
          walk(
            f.type,
            (value as Record<string, unknown>)[f.name],
            path ? `${path}.${f.name}` : f.name,
          );
        return;
      }
      const shown =
        type === "address" &&
        typeof value === "string" &&
        isAddress(value, { strict: false })
          ? getAddress(value)
          : String(value);
      fields.push({ name: path, type, shown });
    };
    walk(typed.primaryType, typed.message, "");
    const domain = typed.domain ?? {};
    if (domain.chainId !== undefined && Number(domain.chainId) !== c.id)
      throw new TestWalletError(
        INVALID,
        `The typed data is for chain ${Number(domain.chainId)}, not the ${c.name}, which the wallet is on: nothing was signed`,
      );
    await ask({
      kind: "typed-data",
      chain: info(c),
      from: account.address,
      domain: {
        ...domain,
        chainId:
          domain.chainId === undefined ? undefined : Number(domain.chainId),
      },
      primaryType: typed.primaryType,
      fields,
    });
    // The definition is the request's, checked by viem as it signs.
    const definition = {
      domain: typed.domain,
      types,
      primaryType: typed.primaryType,
      message: typed.message,
    } as unknown as Parameters<HDAccount["signTypedData"]>[0];
    return account.signTypedData(definition);
  }

  async function personalSign(params: unknown[]): Promise<Hex> {
    const c = served();
    const message = params[0];
    const account = signer(params[1]);
    if (typeof message !== "string" || !isHex(message))
      throw new TestWalletError(
        UNSUPPORTED,
        "personal_sign takes a hex message",
      );
    let text: string | undefined;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.from(message.slice(2), "hex"),
      );
      text = unshowable(decoded) ? undefined : decoded;
    } catch {
      text = undefined;
    }
    const model: MessageRequestModel = {
      kind: "message",
      chain: info(c),
      from: account.address,
      text,
      hex: message,
    };
    await ask(model);
    return account.signMessage({ message: { raw: message } });
  }

  async function request({
    method,
    params,
  }: {
    method: string;
    params?: unknown;
  }): Promise<unknown> {
    const list = (Array.isArray(params) ? params : []) as unknown[];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [accounts[index]!.address];
      case "eth_chainId":
        return `0x${current.toString(16)}`;
      case "wallet_switchEthereumChain": {
        const id = (list[0] as { chainId?: unknown } | undefined)?.chainId;
        const target =
          typeof id === "string" && isHex(id)
            ? chainOf(hexToNumber(id))
            : undefined;
        if (!target)
          throw new TestWalletError(
            UNKNOWN_CHAIN,
            `The test wallet does not know chain ${typeof id === "string" && isHex(id) ? hexToNumber(id) : "?"}`,
          );
        refuseRemote(target);
        if (target.id !== current) {
          current = target.id;
          emit("chainChanged", `0x${current.toString(16)}`);
        }
        return null;
      }
      case "eth_sign":
        throw new TestWalletError(
          UNSUPPORTED,
          "The test wallet refuses eth_sign: it signs a bare hash, which cannot be shown",
        );
      case "personal_sign":
        return personalSign(list);
      case "eth_signTypedData_v4":
        return typedData(list);
      case "eth_sendTransaction":
        return transaction("eth_sendTransaction", list[0]);
      case "eth_signTransaction": {
        const tx = list[0] as { type?: unknown; from?: unknown } | undefined;
        if (tx?.type === "0x6" || tx?.type === "0x06") {
          const c = served();
          return signFrameRequest(tx, {
            account: signer(tx.from),
            chain: info(c),
            nativeShown: (v) => native(c, v),
            ask,
            decode: (to, data) =>
              decodeCall(
                { chainId: c.id, to, data },
                { abiFor, read: readOn(c), standards },
              ),
            labelOf: (a) => labelOf(c.id, a),
          });
        }
        return transaction("eth_signTransaction", list[0]);
      }
      default: {
        if (!READS.has(method))
          throw new TestWalletError(
            UNSUPPORTED,
            `The test wallet does not answer ${method.replace(/[^\w]/g, "").slice(0, 60)}`,
          );
        return clientOf(served()).request({ method, params } as never);
      }
    }
  }

  const provider = {
    request,
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
  } as unknown as EIP1193Provider;

  return {
    provider,
    accounts,
    account: () => accounts[index]!,
    selectAccount(i: number) {
      if (!accounts[i]) throw new Error(`There is no test account ${i}`);
      if (i === index) return;
      index = i;
      emit("accountsChanged", [accounts[i]!.address]);
    },
    chainId: () => current,
    deployed: (id) => [...(deployments.get(id) ?? [])],
  };
}
