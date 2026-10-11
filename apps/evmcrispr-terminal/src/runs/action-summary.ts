// What an action is, as a person reads it before their wallet signs it.
// Two rules:
//  - A description may abbreviate, but it never replaces or leaves out a
//    fact that changes what is signed, and what it cannot say it says it
//    cannot. Nothing is fetched and nothing is guessed.
//  - Describe exactly what is sent, and send exactly what is described.
//    Where this page would have to interpret a request (the text of typed
//    data), it interprets it once (`normaliseAction`), and that one value
//    is both described and sent. Where a request does not have the form
//    its method defines, it is shown raw, as it will be sent.
import type {
  Action,
  SmartBatchAction,
  TransactionAction,
} from "@evmcrispr/sdk";
import {
  type Chain,
  formatEther,
  getTypesForEIP712Domain,
  hashTypedData,
  hexToBytes,
  isAddress,
  isHex,
  validateTypedData,
} from "viem";
import * as viemChains from "viem/chains";
import { chains as appChains } from "../config/rpc";

/** The chain's definition: the app's own (module chains included), else
 *  viem's. */
function chainOf(chainId: number | undefined): Chain | undefined {
  if (chainId === undefined) return undefined;
  return (
    appChains.find((chain) => chain.id === chainId) ??
    (Object.values(viemChains) as Chain[]).find(
      (chain) => chain?.id === chainId,
    )
  );
}

export function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Created contract";
}

export function chainLabel(chainId: number): string {
  return chainOf(chainId)?.name ?? `Chain ${chainId}`;
}

/** How a chain id becomes its definition. */
export type ChainLookup = (chainId: number | undefined) => Chain | undefined;

/** An amount of the chain's own currency. The value of a transaction is
 *  in wei on every chain, so it is always counted with 18 decimals; only
 *  the symbol is the chain's. A chain that is not known has no symbol
 *  here: "native token", never another chain's. */
function nativeAmount(value: bigint, chain: Chain | undefined): string {
  return `${formatEther(value)} ${chain?.nativeCurrency?.symbol ?? "native token"}`;
}

/** One transaction: alone, a call of a batch, or a fixed step of a smart
 *  batch. */
export interface CallDescription {
  title: "Contract call" | "Native transfer" | "Contract deployment";
  /** The whole target address; none for a deployment. */
  to?: string;
  chainId?: number;
  /** Set when value is sent, in the chain's own currency. */
  value?: string;
  /** The same value, exact, in wei. */
  wei?: string;
  /** The function called, whenever there is calldata to a target. */
  selector?: string;
  /** The calldata, whole. */
  data: string;
  delegatecall: boolean;
  warnings: string[];
}

/** What a signature request asks the wallet to sign. */
export type Signing =
  /** `text` has every character that does not show written out. */
  | { kind: "message"; text?: string; hex: string }
  | {
      kind: "typed";
      /** The fields of the domain that are signed: name, type, value. */
      domain: [string, string, string][];
      primaryType: string;
      /** Every field that is signed, as the types declare it: path, type,
       *  value. Nothing else of the request is here. */
      message: [string, string, string][];
      /** The EIP-712 hash that is signed. */
      hash: string;
      raw: string;
    }
  /** Shown as it is: it could not be described. */
  | { kind: "raw"; method: string; raw: string };

export interface ActionDescription {
  /** The one-line form, for lists. It abbreviates what follows. */
  title: string;
  detail: string;
  meta: string;
  /** Every warning of the action and of what it contains. */
  warning?: string;
  chainId?: number;
  /** Every transaction the action sends: one, or all of a batch. */
  calls: CallDescription[];
  signing?: Signing;
  /** The steps of a smart batch, in order. */
  steps?: { label: string; call?: CallDescription; note?: string }[];
  /** What this description cannot say, said plainly. */
  notes: string[];
}

const UNLIMITED_APPROVAL = "This approval may grant unlimited token spending.";
const OPERATOR_APPROVAL =
  "This lets the operator move every token of this collection.";
const RAISED_ALLOWANCE = "This raises a token spending allowance.";
const DELEGATECALL =
  "This is a delegatecall: the target's code runs with the sender's own storage and funds.";

/** Calls this page can tell are risky from their calldata alone. A short
 *  list: no warning never means a call is safe. */
function callWarnings(selector: string | undefined, data: string): string[] {
  const lower = data.toLowerCase();
  if (selector === "0x095ea7b3" && lower.includes("ffffffffffffffff"))
    return [UNLIMITED_APPROVAL];
  // setApprovalForAll(address,bool) with true
  if (selector === "0xa22cb465" && /[^0]/.test(lower.slice(74, 138)))
    return [OPERATOR_APPROVAL];
  // increaseAllowance(address,uint256)
  if (selector === "0x39509351") return [RAISED_ALLOWANCE];
  return [];
}

function describeCall(
  transaction: TransactionAction,
  chains: ChainLookup,
  /** The chain of the batch or plan the call is part of. */
  outer?: number,
): CallDescription {
  const chainId = outer ?? transaction.chainId;
  const data = transaction.data ?? "0x";
  const hasData = data !== "0x";
  const isDeployment = !transaction.to;
  const selector =
    !isDeployment && data.length >= 10 ? data.slice(0, 10) : undefined;
  const warnings = callWarnings(selector, data);
  if (transaction.operation === 1) warnings.push(DELEGATECALL);
  if (
    outer !== undefined &&
    transaction.chainId !== undefined &&
    transaction.chainId !== outer
  )
    warnings.push(
      `This call names ${chains(transaction.chainId)?.name ?? `chain ${transaction.chainId}`}, but it is sent with its batch on ${chains(outer)?.name ?? `chain ${outer}`}.`,
    );
  const sends = transaction.value !== undefined && transaction.value > 0n;
  return {
    title: isDeployment
      ? "Contract deployment"
      : hasData
        ? "Contract call"
        : "Native transfer",
    to: transaction.to,
    chainId,
    value: sends
      ? nativeAmount(transaction.value as bigint, chains(chainId))
      : undefined,
    wei: sends ? String(transaction.value) : undefined,
    selector,
    data,
    delegatecall: transaction.operation === 1,
    warnings,
  };
}

/** The one line of a call: its function and its value, both when both. */
const callMeta = (call: CallDescription) =>
  [call.selector, call.value].filter(Boolean).join(" · ") ||
  (call.title === "Contract deployment" ? "Deploy" : "No value");

const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  ) ?? String(value);

/** Characters that do not show, or that change the direction text reads
 *  in: Unicode's format characters, and the fillers and separators that
 *  render as nothing. */
const INVISIBLE =
  /\p{Cf}|\u034f|\u115f|\u1160|\u17b4|\u17b5|[\u180b-\u180f]|\u2028|\u2029|\u3164|\uffa0/u;

/** Bytes as text, when they are text: valid UTF-8 without control
 *  characters. Characters that do not show, or that change the direction
 *  text reads in, are written out, so the text cannot look like another. */
function textOf(hex: string): { text: string; dressed: boolean } | undefined {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      hexToBytes(hex as `0x${string}`),
    );
  } catch {
    return undefined;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text))
    return undefined;
  const dressed = INVISIBLE.test(text);
  const shown = [...text]
    .map((character) =>
      INVISIBLE.test(character)
        ? `\\u{${(character.codePointAt(0) as number).toString(16).toUpperCase()}}`
        : character,
    )
    .join("");
  return { text: shown, dressed };
}

interface TypedData {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

/** Typed data as the methods that sign it define it (v3 and v4): the
 *  account, then the data as an object or its JSON text. Anything else is
 *  not read. A text is parsed here, once. */
function readTypedData(
  method: string,
  params: unknown[],
): TypedData | undefined {
  if (!/^eth_signTypedData_v[34]$/.test(method)) return undefined;
  if (
    params.length !== 2 ||
    typeof params[0] !== "string" ||
    !isAddress(params[0])
  )
    return undefined;
  let typed = params[1];
  if (typeof typed === "string")
    try {
      typed = JSON.parse(typed);
    } catch {
      return undefined;
    }
  if (typed === null || typeof typed !== "object" || Array.isArray(typed))
    return undefined;
  const {
    types,
    primaryType,
    domain = {},
    message,
  } = typed as Record<string, unknown>;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (
    typeof primaryType !== "string" ||
    !isRecord(types) ||
    !isRecord(domain) ||
    !isRecord(message)
  )
    return undefined;
  return { types, primaryType, domain, message } as TypedData;
}

/** The typed data that is signed: walked from the primary type through
 *  the declared types, the way a wallet encodes it. Fields of the request
 *  that no type declares are not signed; they are returned apart. */
function describeTypedData(typed: TypedData):
  | {
      signing: Signing;
      notes: string[];
    }
  | undefined {
  let hash: string;
  try {
    validateTypedData(typed as never);
    hash = hashTypedData(typed as never);
  } catch {
    return undefined;
  }
  const types: TypedData["types"] = {
    EIP712Domain: getTypesForEIP712Domain({ domain: typed.domain as never }),
    ...typed.types,
  };
  const unsigned: string[] = [];
  const walk = (type: string, value: unknown, path: string) => {
    const rows: [string, string, string][] = [];
    const at = (name: string) => (path ? `${path}.${name}` : name);
    const field = (declared: string, item: unknown, where: string) => {
      const list = declared.match(/^(.*)\[\d*\]$/);
      if (list) {
        const items = Array.isArray(item) ? item : [];
        if (items.length === 0) rows.push([where, declared, "[]"]);
        items.forEach((one, index) => field(list[1], one, `${where}.${index}`));
      } else if (types[declared]) rows.push(...walk(declared, item, where));
      else
        rows.push([
          where,
          declared,
          typeof item === "string" ? item : json(item),
        ]);
    };
    const fields = types[type];
    const data = (value ?? {}) as Record<string, unknown>;
    for (const { name, type: declared } of fields)
      field(declared, data[name], at(name));
    for (const name of Object.keys(data))
      if (!fields.some((declared) => declared.name === name))
        unsigned.push(at(name));
    return rows;
  };
  const domain = walk("EIP712Domain", typed.domain, "");
  const unsignedDomain = unsigned.splice(0).map((path) => `domain.${path}`);
  const message = walk(typed.primaryType, typed.message, "");
  return {
    signing: {
      kind: "typed",
      domain,
      primaryType: typed.primaryType,
      message,
      hash,
      raw: json(typed),
    },
    notes: [...unsignedDomain, ...unsigned].map(
      (path) =>
        `"${path}" is in the request but is not part of what is signed: its type does not declare it.`,
    ),
  };
}

/**
 * The action as it is sent. Typed data is the one request this page has
 * to interpret to describe (its text is parsed): it is rewritten here as
 * the text of what was parsed, so the wallet is handed the very value
 * that is described, and two readings of one text cannot differ. Every
 * other action is sent as it is.
 */
export function normaliseAction(action: Action): Action {
  if (!("type" in action) || action.type !== "wallet") return action;
  const typed = readTypedData(action.method, action.params ?? []);
  if (!typed) return action;
  return {
    ...action,
    params: [action.params[0], JSON.stringify(typed)],
  };
}

const RAW_NOTE =
  "This request cannot be described: it is shown as it will be sent.";

function describeWalletRequest(
  method: string,
  params: unknown[],
  chains: ChainLookup,
): ActionDescription {
  const base = { calls: [], notes: [] as string[] };
  const raw = (note = RAW_NOTE): ActionDescription => ({
    ...base,
    title: /sign/i.test(method) ? "Signature request" : "Wallet request",
    detail: method,
    meta: `${params.length} parameter(s)`,
    signing: { kind: "raw", method, raw: json(params) },
    notes: [note],
  });
  if (method === "wallet_switchEthereumChain") {
    const target = (params as { chainId?: string | number }[])?.[0]?.chainId;
    const chainId = Number(target);
    return {
      ...base,
      title: "Switch network",
      detail: Number.isInteger(chainId)
        ? (chains(chainId)?.name ?? `Chain ${chainId}`)
        : String(target),
      meta: "Wallet prompt",
      chainId: Number.isInteger(chainId) ? chainId : undefined,
    };
  }
  if (method === "personal_sign") {
    // The method defines the order: the message, then the account. A
    // request in any other shape is not guessed at.
    const [hex, account] = params;
    if (
      params.length !== 2 ||
      !isHex(hex) ||
      typeof account !== "string" ||
      !isAddress(account)
    )
      return raw();
    const read = textOf(hex);
    return {
      ...base,
      title: "Sign a message",
      detail: read?.text ?? hex,
      meta: "Signature",
      signing: read
        ? { kind: "message", text: read.text, hex }
        : { kind: "message", hex },
      warning: read?.dressed
        ? "This message contains characters that do not show or that change the direction of text. They are written out here."
        : undefined,
      notes: [
        ...(read
          ? []
          : ["The message is not text: it is shown as the bytes to sign."]),
        ...(hex.length === 42
          ? [
              "The message is the size of an address. It is the first parameter, which is what this method signs.",
            ]
          : []),
      ],
    };
  }
  if (/^eth_signTypedData/.test(method)) {
    const typed = readTypedData(method, params);
    const described = typed && describeTypedData(typed);
    if (!described)
      return raw(
        /^eth_signTypedData(_v1)?$/.test(method)
          ? "This is the legacy form of typed data: it cannot be described, and is shown as it will be sent."
          : "This typed data cannot be described (it does not follow its own types): it is shown as it will be sent.",
      );
    return {
      ...base,
      title: "Sign typed data",
      detail:
        described.signing.kind === "typed" ? described.signing.primaryType : "",
      meta: "Signature",
      signing: described.signing,
      notes: described.notes,
    };
  }
  return raw(
    method === "eth_sign"
      ? "This signs a bare hash: this page cannot say what it stands for."
      : RAW_NOTE,
  );
}

function describeSmartBatch(
  plan: SmartBatchAction["plan"],
  chains: ChainLookup,
): Pick<ActionDescription, "steps" | "notes"> {
  const steps = plan.steps.map((step) => {
    if (step.kind === "transaction")
      return {
        label: step.label,
        call: describeCall(step.action, chains, plan.chainId),
      };
    const call = step.call;
    const target = call
      ? typeof call.target === "string"
        ? call.target
        : "a target resolved at execution"
      : undefined;
    const signature = call
      ? `${call.abi.name}(${call.abi.inputs.map((input) => input.type).join(", ")})`
      : undefined;
    return {
      label: step.label,
      note: [
        [target, signature].filter(Boolean).join(" · "),
        `resolved at execution${
          step.dynamicFields?.length ? `: ${step.dynamicFields.join(", ")}` : ""
        }`,
      ]
        .filter(Boolean)
        .join(" — "),
    };
  });
  return {
    steps,
    notes: [
      "Some values are resolved during execution: what is listed is what is fixed now, and simulated values can change before signing.",
    ],
  };
}

/** Every warning of the action and of what it contains, once each. */
const allWarnings = (description: ActionDescription) => [
  ...new Set([
    ...(description.warning ? [description.warning] : []),
    ...[
      ...description.calls,
      ...(description.steps ?? []).flatMap((step) => step.call ?? []),
    ].flatMap((call) => call.warnings),
  ]),
];

/** The one function that turns an action into what is displayed: in the
 *  review's list, and next to the Resume of a paused run. Give it the
 *  action as it is sent (`normaliseAction`). */
export function actionSummary(
  action: Action,
  chains: ChainLookup = chainOf,
): ActionDescription {
  const described = describe(action, chains);
  const warnings = allWarnings(described);
  return { ...described, warning: warnings.join(" ") || undefined };
}

function describe(action: Action, chains: ChainLookup): ActionDescription {
  if ("executionPlan" in action && action.executionPlan)
    return describe(
      {
        type: "smartBatch",
        from: action.executionPlan.account,
        chainId: action.executionPlan.chainId,
        plan: action.executionPlan,
      },
      chains,
    );
  if (!("type" in action)) {
    const call = describeCall(action, chains);
    return {
      title: call.title,
      detail: call.to ?? "Creates a new contract",
      meta: callMeta(call),
      chainId: call.chainId,
      calls: [call],
      notes: [],
    };
  }
  if (action.type === "wallet")
    return describeWalletRequest(action.method, action.params ?? [], chains);
  if (action.type === "rpc")
    return {
      title: "RPC request",
      detail: action.method,
      meta: "Network operation",
      calls: [],
      notes: [],
    };
  if (action.type === "terminal")
    return {
      title: "Terminal action",
      detail: action.command,
      meta: "Local operation",
      calls: [],
      notes: [],
    };
  if (action.type === "smartBatch")
    return {
      title: "Atomic smart batch",
      detail: `Account ${action.plan.account}`,
      meta: `${action.plan.steps.length} steps`,
      chainId: action.chainId,
      calls: [],
      ...describeSmartBatch(action.plan, chains),
    };
  return {
    title: "Transaction batch",
    detail: `${action.actions.length} calls`,
    meta: chains(action.chainId)?.name ?? `Chain ${action.chainId}`,
    chainId: action.chainId,
    calls: action.actions.map((inner) =>
      describeCall(inner, chains, action.chainId),
    ),
    notes: [],
  };
}
