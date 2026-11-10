// Decoding a call from its bytes: an ABI the host vouches for (a verified
// source), else the standards matched by selector, else the raw words.
import {
  type Abi,
  type AbiFunction,
  type Address,
  decodeFunctionData,
  erc20Abi,
  erc721Abi,
  erc4626Abi,
  formatUnits,
  getAddress,
  type Hex,
  size,
  slice,
  toFunctionSelector,
} from "viem";

export interface DecodedArg {
  name: string;
  type: string;
  shown: string;
}

export interface DecodedCall {
  selector?: Hex;
  functionName?: string;
  args?: DecodedArg[];
  source: "verified" | "standard" | "none";
  /** Where the decoding came from: the host's label, "matches ERC-20", or "not decoded". */
  sourceLabel: string;
  /** The calldata: the selector, then one 32-byte word per line. */
  words: string[];
}

/** An ABI the host vouches for, with what to call its source ("verified on Sourcify"). */
export type AbiFor = (
  chainId: number,
  address: Address,
) => Promise<{ abi: Abi; label: string } | undefined>;

/** A read on the call's chain: the return data, or undefined when it fails. */
export type Read = (to: Address, data: Hex) => Promise<Hex | undefined>;

const STANDARDS: { name: string; abi: Abi }[] = [
  { name: "ERC-20", abi: erc20Abi },
  { name: "ERC-721", abi: erc721Abi },
  { name: "ERC-4626", abi: erc4626Abi },
];

/** The calldata, word by word. */
export function words(data: Hex): string[] {
  if (size(data) === 0) return [];
  const hex = data.slice(2);
  const out = [`0x${hex.slice(0, 8)}`];
  for (let i = 8; i < hex.length; i += 64) out.push(hex.slice(i, i + 64));
  return out;
}

/** A token symbol as the chain gives it, kept to what a symbol is. */
function cleanSymbol(raw: string): string | undefined {
  const s = raw.replace(/[^A-Za-z0-9.$_-]/g, "").slice(0, 12);
  return s === "" ? undefined : s;
}

function decodeString(data: Hex): string | undefined {
  try {
    const len = Number(BigInt(slice(data, 32, 64)));
    const bytes = Buffer.from(slice(data, 64, 64 + len).slice(2), "hex");
    return bytes.toString("utf8");
  } catch {
    return undefined;
  }
}

/** The decimals and symbol of an ERC-20 at `token`, or undefined. */
export async function tokenInfo(
  read: Read,
  token: Address,
): Promise<{ decimals: number; symbol?: string } | undefined> {
  const decimals = await read(token, toFunctionSelector("decimals()"));
  if (!decimals || size(decimals) !== 32) return undefined;
  const d = Number(BigInt(decimals));
  if (d > 77) return undefined;
  const symbol = await read(token, toFunctionSelector("symbol()"));
  const text = symbol && size(symbol) >= 64 ? decodeString(symbol) : undefined;
  return { decimals: d, symbol: text ? cleanSymbol(text) : undefined };
}

/** Characters that change how text reads without being seen (bidi
 *  controls, zero-width marks), written out as escapes. */
export function visible(text: string): string {
  return text.replace(
    /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`,
  );
}

function show(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string")
    return /^0x[0-9a-fA-F]{40}$/.test(value)
      ? getAddress(value)
      : visible(value);
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${k}: ${show(v)}`)
      .join(", ")} }`;
  return String(value);
}

function tryDecode(abi: Abi, data: Hex) {
  try {
    const decoded = decodeFunctionData({ abi, data });
    const fn = abi.find(
      (item): item is AbiFunction =>
        item.type === "function" && item.name === decoded.functionName,
    );
    return fn ? { decoded, fn } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The call `data` makes to `to`, decoded from its bytes. ERC-20 amounts are
 * shown in the token's units with its symbol, as the chain answers them; an
 * approve or transferFrom shared by ERC-20 and ERC-721 is read as ERC-20
 * only when the target answers `decimals()`.
 */
export async function decodeCall(
  { chainId, to, data }: { chainId: number; to: Address; data: Hex },
  {
    abiFor,
    read,
    standards = [],
  }: {
    abiFor?: AbiFor;
    read: Read;
    /** More ABIs to match by selector, after ERC-20, ERC-721 and ERC-4626 ("the frame account"). */
    standards?: readonly { name: string; abi: Abi }[];
  },
): Promise<DecodedCall | undefined> {
  if (size(data) === 0) return undefined;
  const raw = words(data);
  const selector = size(data) >= 4 ? slice(data, 0, 4) : undefined;
  const vouched = await abiFor?.(chainId, to).catch(() => undefined);
  const candidates: {
    abi: Abi;
    label: string;
    source: DecodedCall["source"];
    standard?: string;
  }[] = [
    ...(vouched ? [{ ...vouched, source: "verified" as const }] : []),
    ...[...STANDARDS, ...standards].map((s) => ({
      abi: s.abi,
      label: `matches ${s.name}`,
      source: "standard" as const,
      standard: s.name,
    })),
  ];
  let token: Awaited<ReturnType<typeof tokenInfo>> | null = null;
  const tokenOf = async () => {
    if (token === null) token = await tokenInfo(read, to);
    return token;
  };
  for (const candidate of candidates) {
    const hit = tryDecode(candidate.abi, data);
    if (!hit) continue;
    if (candidate.standard === "ERC-20" && !(await tokenOf())) {
      // Not a token answering decimals(): the ERC-721 reading, if any.
      continue;
    }
    const info = candidate.standard === "ERC-20" ? await tokenOf() : undefined;
    const args = (hit.decoded.args ?? []).map((value, i) => {
      const input = hit.fn.inputs[i]!;
      const shown =
        info && input.type === "uint256" && typeof value === "bigint"
          ? `${formatUnits(value, info.decimals)}${info.symbol ? ` ${info.symbol}` : ""}`
          : show(value);
      return { name: input.name || `#${i}`, type: input.type, shown };
    });
    return {
      selector,
      functionName: hit.decoded.functionName,
      args,
      source: candidate.source,
      sourceLabel: candidate.label,
      words: raw,
    };
  }
  return { selector, source: "none", sourceLabel: "not decoded", words: raw };
}
