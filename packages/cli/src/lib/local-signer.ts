import { AsyncLocalStorage } from "node:async_hooks";
import { chainLabel, viemChainById } from "@evmcrispr/sdk";
import {
  type Address,
  bytesToHex,
  formatUnits,
  type Hex,
  type LocalAccount,
  type SignableMessage,
  size,
  slice,
} from "viem";
import type { Confirm } from "./confirm";

/** A frame as `@evmcrispr/viem-frames` lays it out (EIP-8141). */
export interface FrameLike {
  mode: number;
  flags: number;
  target: Address | null;
  limits: { execution: bigint; state: bigint };
  value: bigint;
  data: Hex;
}

type TransactionLike = {
  chainId?: number;
  to?: Address | null;
  value?: bigint;
  data?: Hex;
  input?: Hex;
  nonce?: number;
  gas?: bigint;
  sender?: Address;
  frames?: readonly FrameLike[];
};

export type SignatureRequest = { label?: string; account?: Address } & (
  | { type: "transaction"; transaction: TransactionLike }
  | { type: "message"; message: SignableMessage }
  | {
      type: "typedData";
      typedData: {
        domain?: {
          name?: string;
          version?: string;
          chainId?: number | bigint;
          verifyingContract?: Address;
          salt?: Hex;
        };
        primaryType?: string;
        message?: unknown;
      };
    }
  | { type: "hash"; hash: Hex }
  | {
      type: "authorization";
      authorization: {
        chainId: number;
        address?: Address;
        contractAddress?: Address;
        nonce: number;
      };
    }
);

const MODES = ["DEFAULT", "VERIFY", "SENDER"];
const SCOPES = [
  "approves nothing",
  "approves payment",
  "approves execution",
  "approves payment and execution",
];
const APPROVE_PAYMENT = 1;

/**
 * Text from a request, safe to write to a terminal: C0 and C1 controls
 * (ESC, CR, LF among them), DEL and bidirectional overrides become
 * visible escapes, so a field cannot redraw or hide the summary.
 */
export function printable(value: unknown): string {
  return String(value).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
    /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (c) => {
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      const code = c.charCodeAt(0);
      return code <= 0xff
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : `\\u${code.toString(16).padStart(4, "0")}`;
    },
  );
}

/** JSON with bigints as decimal strings, escaped for the terminal. */
function printableJson(value: unknown): string {
  return printable(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}
const ATOMIC = 0x4;

function nativeAmount(value: bigint, chainId: number | undefined): string {
  const currency = viemChainById(chainId)?.nativeCurrency ?? {
    symbol: "ETH",
    decimals: 18,
  };
  return printable(
    `${formatUnits(value, currency.decimals)} ${currency.symbol}`,
  );
}

function callText(data: Hex | undefined): string {
  if (!data || size(data) === 0) return "none";
  const bytes = size(data);
  return bytes >= 4
    ? `${printable(slice(data, 0, 4))} (${bytes} bytes)`
    : `${printable(data)} (${bytes} bytes)`;
}

function chainText(chainId: number | undefined): string {
  return chainId ? printable(chainLabel(chainId)) : "an unspecified chain";
}

function describeFrame(frame: FrameLike, i: number, chainId?: number): string {
  const mode = MODES[frame.mode] ?? `mode ${printable(frame.mode)}`;
  const parts = [mode, SCOPES[frame.flags & 0x3]];
  if (frame.flags & ATOMIC) parts.push("atomic");
  parts.push(
    `target ${printable(frame.target ?? "sender")}`,
    `value ${nativeAmount(frame.value, chainId)}`,
    `call ${callText(frame.data)}`,
    `limits execution ${printable(frame.limits.execution)}, state ${printable(frame.limits.state)}`,
  );
  return `  Frame ${i}: ${parts.join("; ")}`;
}

function describeTransaction(tx: TransactionLike, account?: Address): string[] {
  if (tx.frames) {
    const from = tx.sender ?? account;
    const payer = tx.frames.find(
      (f) => f.mode === 1 && f.flags & APPROVE_PAYMENT,
    );
    return [
      `Sign a frame transaction on ${chainText(tx.chainId)}`,
      ...(from ? [`  sender: ${printable(from)}`] : []),
      `  payer:  ${payer ? printable(payer.target ?? from ?? "sender") : "none approved"}`,
      ...(tx.nonce !== undefined ? [`  nonce:  ${printable(tx.nonce)}`] : []),
      ...tx.frames.map((f, i) => describeFrame(f, i, tx.chainId)),
    ];
  }
  return [
    `Sign a transaction on ${chainText(tx.chainId)}`,
    ...(account ? [`  from:  ${printable(account)}`] : []),
    `  to:    ${tx.to ? printable(tx.to) : "a new contract"}`,
    `  value: ${nativeAmount(tx.value ?? 0n, tx.chainId)}`,
    `  call:  ${callText(tx.data ?? tx.input)}`,
    ...(tx.nonce !== undefined ? [`  nonce: ${printable(tx.nonce)}`] : []),
    ...(tx.gas !== undefined ? [`  gas:   ${printable(tx.gas)}`] : []),
  ];
}

/** What a signature commits to, for the user to confirm. */
export function describeSignature(request: SignatureRequest): string {
  const lines: string[] = [];
  if (request.label) lines.push(printable(request.label));
  switch (request.type) {
    case "transaction":
      lines.push(...describeTransaction(request.transaction, request.account));
      break;
    case "message": {
      const { message } = request;
      const from = request.account
        ? [`  from: ${printable(request.account)}`]
        : [];
      lines.push(
        "Sign a message",
        ...from,
        typeof message === "string"
          ? `  message: ${printableJson(message)}`
          : `  message (bytes): ${printable(typeof message.raw === "string" ? message.raw : bytesToHex(message.raw))}`,
      );
      break;
    }
    case "typedData": {
      const { domain = {}, primaryType, message } = request.typedData;
      lines.push(
        `Sign typed data ${printable(primaryType ?? "")}`.trimEnd(),
        ...(request.account ? [`  from: ${printable(request.account)}`] : []),
        `  domain name:        ${domain.name !== undefined ? printableJson(domain.name) : "none"}`,
        `  domain version:     ${domain.version !== undefined ? printableJson(domain.version) : "none"}`,
        `  domain chain:       ${domain.chainId !== undefined ? chainText(Number(domain.chainId)) : "none"}`,
        `  verifying contract: ${domain.verifyingContract !== undefined ? printable(domain.verifyingContract) : "none"}`,
        `  salt:               ${domain.salt !== undefined ? printable(domain.salt) : "none"}`,
        `  message: ${printableJson(message)}`,
      );
      break;
    }
    case "hash":
      lines.push(
        "Sign a raw hash (it can authorize anything this account can)",
        ...(request.account ? [`  from: ${printable(request.account)}`] : []),
        `  hash: ${printable(request.hash)}`,
      );
      break;
    case "authorization": {
      const a = request.authorization;
      lines.push(
        `Sign an EIP-7702 authorization on ${a.chainId === 0 ? "every chain" : printable(chainLabel(a.chainId))}`,
        ...(request.account
          ? [`  account:     ${printable(request.account)}`]
          : []),
        `  delegate to: ${printable(a.address ?? a.contractAddress)}`,
        `  nonce:       ${printable(a.nonce)}`,
      );
      break;
    }
  }
  return lines.join("\n");
}

export type ConfirmingAccount = LocalAccount & {
  /** Shows `label` on every signature asked for while `fn` runs. */
  labelled<T>(label: string, fn: () => Promise<T>): Promise<T>;
};

/**
 * `account`, signing nothing until `confirm` has seen what is signed and
 * agreed. A refusal throws "Not signed".
 */
export function confirmingAccount(
  account: LocalAccount,
  confirm: Confirm,
): ConfirmingAccount {
  const labels = new AsyncLocalStorage<string>();
  const approve = async (request: SignatureRequest) => {
    const ok = await confirm(
      describeSignature({
        ...request,
        account: account.address,
        label: labels.getStore(),
      }),
    );
    if (ok !== true) throw new Error("Not signed");
  };
  const wrapped: ConfirmingAccount = {
    address: account.address,
    publicKey: account.publicKey,
    source: account.source,
    type: "local",
    nonceManager: account.nonceManager,
    async signMessage(args) {
      await approve({ type: "message", message: args.message });
      return account.signMessage(args);
    },
    async signTransaction(transaction, options) {
      await approve({
        type: "transaction",
        transaction: transaction as TransactionLike,
      });
      return account.signTransaction(transaction, options as any);
    },
    async signTypedData(typedData) {
      await approve({ type: "typedData", typedData: typedData as any });
      return account.signTypedData(typedData);
    },
    labelled: (label, fn) => labels.run(label, fn),
  };
  if (account.sign) {
    const sign = account.sign;
    wrapped.sign = async (args) => {
      await approve({ type: "hash", hash: args.hash });
      return sign(args);
    };
  }
  if (account.signAuthorization) {
    const signAuthorization = account.signAuthorization;
    wrapped.signAuthorization = async (authorization) => {
      await approve({
        type: "authorization",
        authorization: authorization as any,
      });
      return signAuthorization(authorization);
    };
  }
  return wrapped;
}
