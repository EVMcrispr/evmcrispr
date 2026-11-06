import { AsyncLocalStorage } from "node:async_hooks";
import { chainLabel, viemChainById } from "@evmcrispr/sdk";
import {
  type Address,
  bytesToHex,
  formatGwei,
  formatUnits,
  getTypesForEIP712Domain,
  type Hex,
  isAddress,
  type LocalAccount,
  type SignableMessage,
  size,
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
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  /** A frame transaction's sender, as its serializer encodes it. */
  from?: Address;
  frames?: readonly FrameLike[];
};

type TypedFields = Record<string, readonly { name: string; type: string }[]>;
type TypedDataLike = {
  domain?: Record<string, unknown>;
  types?: TypedFields;
  primaryType?: string;
  message?: unknown;
};

/** The EIP712Domain fields viem hashes for this typed data. */
function domainFields(typed: TypedDataLike) {
  return (
    typed.types?.EIP712Domain ??
    getTypesForEIP712Domain({ domain: (typed.domain ?? {}) as any })
  );
}

const keysOf = (value: unknown) =>
  value && typeof value === "object"
    ? Object.keys(value).filter(
        (k) => (value as Record<string, unknown>)[k] !== undefined,
      )
    : [];

/** Message fields (at any depth) no struct type defines: viem leaves them
 *  out of the hash, so showing them would show what is not signed. */
function undefinedFields(
  types: TypedFields,
  type: string,
  value: unknown,
  path: string,
  out: string[],
) {
  const array = type.match(/^(.*)\[\d*\]$/);
  if (array) {
    if (Array.isArray(value))
      value.forEach((v, i) => {
        undefinedFields(types, array[1], v, `${path}[${i}]`, out);
      });
    return;
  }
  const fields = types[type];
  if (!fields) return;
  for (const key of keysOf(value)) {
    const field = fields.find((f) => f.name === key);
    if (!field) out.push(path ? `${path}.${key}` : key);
    else
      undefinedFields(
        types,
        field.type,
        (value as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        out,
      );
  }
}

const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)$/;

/** Why `value` is not the canonical form of `type`, if it is not. viem
 *  coerces what it is given (`toHex` on a string field's number, keccak of
 *  a non-hex `bytes` as UTF-8, `BigInt` on a hex or padded integer
 *  string), so only canonical values hash as they read. */
function primitiveProblem(type: string, value: unknown): string | undefined {
  if (value === undefined) return "is missing";
  if (type === "string") {
    if (typeof value !== "string") return "is not a string";
    // A lone surrogate is hashed as U+FFFD: not what the summary shows.
    return value.isWellFormed() ? undefined : "is not well-formed Unicode";
  }
  if (type === "bool")
    return typeof value === "boolean" ? undefined : "is not true or false";
  if (type === "address")
    return typeof value === "string" && isAddress(value)
      ? undefined
      : "is not an address";
  if (type === "bytes")
    return typeof value === "string" && HEX_BYTES.test(value)
      ? undefined
      : "is not 0x-prefixed hex of whole bytes";
  const bytesN = type.match(/^bytes([1-9]|[12]\d|3[0-2])$/);
  if (bytesN) {
    const n = Number(bytesN[1]);
    return typeof value === "string" &&
      HEX_BYTES.test(value) &&
      value.length === 2 + 2 * n
      ? undefined
      : `is not 0x-prefixed hex of ${n} bytes`;
  }
  const int = type.match(/^(u?)int(\d+)$/);
  const bits = int ? Number(int[2]) : 0;
  if (int && bits >= 8 && bits <= 256 && bits % 8 === 0) {
    let n: bigint;
    if (typeof value === "bigint") n = value;
    else if (typeof value === "number" && Number.isSafeInteger(value))
      n = BigInt(value);
    else if (typeof value === "string" && DECIMAL.test(value))
      n = BigInt(value);
    else return "is not a bigint, safe integer or decimal string";
    const signed = int[1] === "";
    const max = 2n ** BigInt(signed ? bits - 1 : bits) - 1n;
    const min = signed ? -max - 1n : 0n;
    return n < min || n > max ? `is out of range for ${type}` : undefined;
  }
  return `has an unknown type ${type}`;
}

/** Values (at any depth) viem would encode other than as they read. */
function nonCanonical(
  types: TypedFields,
  type: string,
  value: unknown,
  path: string,
  out: string[],
) {
  const array = type.match(/^(.*)\[\d*\]$/);
  if (array) {
    if (!Array.isArray(value)) out.push(`${path} is not an array`);
    else
      value.forEach((v, i) => {
        nonCanonical(types, array[1], v, `${path}[${i}]`, out);
      });
    return;
  }
  const fields = types[type];
  if (fields) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      out.push(`${path} is not a ${type}`);
    else
      for (const f of fields)
        nonCanonical(
          types,
          f.type,
          (value as Record<string, unknown>)[f.name],
          `${path}.${f.name}`,
          out,
        );
    return;
  }
  const problem = primitiveProblem(type, value);
  if (problem) out.push(`${path} (${type}) ${problem}`);
}

/** Why typed data would be signed differently from how it reads, if it
 *  would: fields outside its types, which viem does not hash, or values
 *  viem would coerce before hashing. */
export function typedDataMismatch(typed: TypedDataLike): string | undefined {
  const problems: string[] = [];
  const listed = domainFields(typed).map((f) => f.name);
  const extraDomain = keysOf(typed.domain).filter((k) => !listed.includes(k));
  if (extraDomain.length)
    problems.push(
      `domain fields not in its EIP712Domain type: ${extraDomain.join(", ")}`,
    );
  const types = typed.types ?? {};
  const domainTypes = { ...types, EIP712Domain: domainFields(typed) };
  nonCanonical(
    domainTypes,
    "EIP712Domain",
    Object.fromEntries(
      domainTypes.EIP712Domain.map((f) => [f.name, typed.domain?.[f.name]]),
    ),
    "domain",
    problems,
  );
  if (typed.primaryType === "EIP712Domain") {
    if (keysOf(typed.message).length)
      problems.push("a message with primaryType EIP712Domain is not signed");
  } else if (!typed.primaryType || !types[typed.primaryType]) {
    problems.push(`no struct type for primaryType ${typed.primaryType}`);
  } else {
    const extra: string[] = [];
    undefinedFields(types, typed.primaryType, typed.message, "", extra);
    if (extra.length)
      problems.push(
        `message fields not in ${typed.primaryType}: ${extra.join(", ")}`,
      );
    nonCanonical(types, typed.primaryType, typed.message, "message", problems);
  }
  return problems.length ? printable(problems.join("; ")) : undefined;
}

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
        types?: TypedFields;
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

/** Hex bytes per line of shown calldata. */
const CALL_LINE_BYTES = 32;

/** The whole calldata: the selector and size on the first line, then the
 *  rest one 32-byte word per line, `indent`ed, so every byte that is
 *  signed is shown. */
function callLines(data: Hex | undefined, indent: string): string[] {
  if (!data || size(data) === 0) return ["none"];
  const bytes = size(data);
  const hex = data.slice(2);
  const lines = [`0x${printable(hex.slice(0, 8))} (${bytes} bytes)`];
  for (let i = 8; i < hex.length; i += 2 * CALL_LINE_BYTES)
    lines.push(`${indent}${printable(hex.slice(i, i + 2 * CALL_LINE_BYTES))}`);
  return lines;
}

const gwei = (value: bigint) => `${printable(formatGwei(value))} gwei`;

/** The fee fields a transaction carries, each in gwei. */
function feeLines(tx: TransactionLike): string[] {
  return [
    ...(tx.gasPrice !== undefined
      ? [`  gas price:    ${gwei(tx.gasPrice)}`]
      : []),
    ...(tx.maxFeePerGas !== undefined
      ? [`  max fee:      ${gwei(tx.maxFeePerGas)}`]
      : []),
    ...(tx.maxPriorityFeePerGas !== undefined
      ? [`  priority fee: ${gwei(tx.maxPriorityFeePerGas)}`]
      : []),
  ];
}

function chainText(chainId: number | undefined): string {
  return chainId ? printable(chainLabel(chainId)) : "an unspecified chain";
}

/** A frame's summary, numbered as frame:tx numbers frames (from 1). */
function describeFrame(
  frame: FrameLike,
  i: number,
  chainId?: number,
): string[] {
  const mode = MODES[frame.mode] ?? `mode ${printable(frame.mode)}`;
  const parts = [mode, SCOPES[frame.flags & 0x3]];
  if (frame.flags & ATOMIC) parts.push("atomic");
  parts.push(
    `target ${printable(frame.target ?? "sender")}`,
    `value ${nativeAmount(frame.value, chainId)}`,
    `limits execution ${printable(frame.limits.execution)}, state ${printable(frame.limits.state)}`,
  );
  const [call, ...rest] = callLines(frame.data, "    ");
  parts.push(`call ${call}`);
  return [`  Frame ${i + 1}: ${parts.join("; ")}`, ...rest];
}

function describeTransaction(tx: TransactionLike, account?: Address): string[] {
  if (tx.frames) {
    const from = tx.from ?? account;
    const payer = tx.frames.find(
      (f) => f.mode === 1 && f.flags & APPROVE_PAYMENT,
    );
    const gas = tx.frames.reduce(
      (sum, f) => sum + f.limits.execution + f.limits.state,
      0n,
    );
    return [
      `Sign a frame transaction on ${chainText(tx.chainId)}`,
      ...(from ? [`  sender: ${printable(from)}`] : []),
      `  payer:  ${payer ? printable(payer.target ?? from ?? "sender") : "none approved"}`,
      ...(tx.nonce !== undefined ? [`  nonce:  ${printable(tx.nonce)}`] : []),
      ...feeLines(tx),
      ...(tx.maxFeePerGas !== undefined
        ? [
            `  max cost:     ${nativeAmount(gas * tx.maxFeePerGas, tx.chainId)} (every frame's limits at the max fee)`,
          ]
        : []),
      ...tx.frames.flatMap((f, i) => describeFrame(f, i, tx.chainId)),
    ];
  }
  const [call, ...rest] = callLines(tx.data ?? tx.input, "    ");
  return [
    `Sign a transaction on ${chainText(tx.chainId)}`,
    ...(account ? [`  from:  ${printable(account)}`] : []),
    `  to:    ${tx.to ? printable(tx.to) : "a new contract"}`,
    `  value: ${nativeAmount(tx.value ?? 0n, tx.chainId)}`,
    `  call:  ${call}`,
    ...rest,
    ...(tx.nonce !== undefined ? [`  nonce: ${printable(tx.nonce)}`] : []),
    ...(tx.gas !== undefined ? [`  gas:   ${printable(tx.gas)}`] : []),
    ...feeLines(tx),
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
      const typed = request.typedData;
      const domain = (typed.domain ?? {}) as Record<string, unknown>;
      const types = typed.types ?? {};
      const primaryType = typed.primaryType ?? "";
      const struct = types[primaryType] ?? [];
      const domainValue = (name: string) => {
        const value = domain[name];
        if (value === undefined) return "none";
        if (name === "chainId") {
          const id =
            typeof value === "number" || typeof value === "bigint"
              ? Number(value)
              : typeof value === "string" && /^(0x[0-9a-f]+|\d+)$/i.test(value)
                ? Number(value)
                : Number.NaN;
          return Number.isSafeInteger(id) && id > 0
            ? `${chainText(id)} (${id})`
            : printableJson(value);
        }
        return printableJson(value);
      };
      lines.push(
        `Sign typed data ${printable(primaryType)}`.trimEnd(),
        ...(request.account ? [`  from: ${printable(request.account)}`] : []),
        "  domain:",
        ...domainFields(typed).map(
          (f) =>
            `    ${printable(f.name)} (${printable(f.type)}): ${domainValue(f.name)}`,
        ),
      );
      if (primaryType !== "EIP712Domain") {
        const message = (typed.message ?? {}) as Record<string, unknown>;
        lines.push(
          `  ${printable(primaryType)}(${struct.map((f) => `${printable(f.type)} ${printable(f.name)}`).join(", ")})`,
          ...struct.map(
            (f) =>
              `    ${printable(f.name)}: ${printableJson(message[f.name])}`,
          ),
        );
      }
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
 * A copy of what is about to be signed, so the bytes signed are the ones
 * shown even if the caller changes its object while the prompt is open.
 * Data is copied deeply; functions (viem puts the account and the chain,
 * with their methods, on a prepared request) are kept as they are: they
 * are code, not signed data, and `structuredClone` refuses them.
 */
export function snapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return structuredClone(value);
  if (Array.isArray(value)) return value.map(snapshot) as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    return structuredClone(value);
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, snapshot(v)]),
  ) as T;
}

/** Prompts run one at a time, across every confirming account: a second
 *  signature asked for meanwhile waits for the first answer. */
let prompts: Promise<unknown> = Promise.resolve();

/**
 * `account`, signing nothing until `confirm` has seen what is signed and
 * agreed. A refusal throws "Not signed". What is shown and signed is a
 * snapshot of the request taken when it is asked for.
 */
export function confirmingAccount(
  account: LocalAccount,
  confirm: Confirm,
): ConfirmingAccount {
  const labels = new AsyncLocalStorage<string>();
  const approve = (request: SignatureRequest): Promise<void> => {
    const summary = describeSignature({
      ...request,
      account: account.address,
      label: labels.getStore(),
    });
    const turn = prompts.then(async () => {
      const ok = await confirm(summary);
      if (ok !== true) throw new Error("Not signed");
    });
    prompts = turn.catch(() => undefined);
    return turn;
  };
  const wrapped: ConfirmingAccount = {
    address: account.address,
    publicKey: account.publicKey,
    source: account.source,
    type: "local",
    nonceManager: account.nonceManager,
    async signMessage(args) {
      const message = snapshot(args.message);
      await approve({ type: "message", message });
      return account.signMessage({ ...args, message });
    },
    async signTransaction(transaction, options) {
      const shown = snapshot(transaction);
      await approve({
        type: "transaction",
        transaction: shown as TransactionLike,
      });
      return account.signTransaction(shown, options as any);
    },
    async signTypedData(typedData) {
      const shown = snapshot(typedData);
      const mismatch = typedDataMismatch(shown as TypedDataLike);
      if (mismatch) throw new Error(`Not signed: ${mismatch}`);
      await approve({ type: "typedData", typedData: shown as any });
      return account.signTypedData(shown);
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
      const shown = snapshot(authorization);
      await approve({
        type: "authorization",
        authorization: shown as any,
      });
      return signAuthorization(shown);
    };
  }
  return wrapped;
}
