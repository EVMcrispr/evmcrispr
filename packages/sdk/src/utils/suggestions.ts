import type { AbiEvent, Address, Hex } from "viem";
import {
  decodeEventLog,
  formatUnits,
  getAddress,
  isAddress,
  parseAbiItem,
  toEventSelector,
} from "viem";
import { truncateAddress } from "./format";
import { PLAIN_WORD } from "./tokenlist";

/**
 * Assertions suggested from a simulated run. A module declares the events
 * it recognises (`src/events/<name>.ts`, `defineEvent`); the simulation
 * matches the run's logs against them and each declaration answers with
 * the `assert` lines its companion views confirm.
 */

export type SuggestionKind = "state" | "amount";

/** An account or a contract in a sentence. `name` is the short plain name
 *  the contract gives itself, when it has one: its own word, to be shown
 *  with a way to see the address behind it. */
export interface AddressPart {
  type: "address";
  address: Address;
  name?: string;
  /** The chain's token list gives this address that very name: a host may
   *  trust it more than a name only the contract vouches for. */
  listed?: true;
}

/** An amount in a sentence: base units of a token, or of the chain's own
 *  currency. `value` is the exact number the line asserts, as a decimal
 *  string (it fits no number, and a string survives JSON); `text` is the
 *  amount as a person would say it, rounded for reading. */
export interface AmountPart {
  type: "amount";
  value: string;
  /** How the line asserts it, and so which way `text` is rounded: a host
   *  that formats `value` itself rounds a floor down and a ceiling up. */
  bound: AmountBound;
  token: Address | "native";
  symbol?: string;
  decimals?: number;
  /** The chain's token list gives the token that very symbol. */
  listed?: true;
  text: string;
}

/** A sentence is plain text interleaved with what it mentions, so a host
 *  can link an address and format an amount its own way. */
export type SentencePart =
  | { type: "text"; text: string }
  | AddressPart
  | AmountPart;

/** An address a declaration talks about: what it is there (`role`, which
 *  names its variable) and the name it gives itself, if any. */
export interface AddressRef {
  ref: "address";
  address: Address;
  role: string;
  name?: string;
}

/** A token: a contract whose amounts can be written in its own units
 *  (`decimals`). `listed` is the symbol the chain's token list resolves to
 *  exactly it, and the only name that may name its variable. */
export interface TokenRef extends Omit<AddressRef, "ref"> {
  ref: "token";
  decimals?: number;
  listed?: string;
}

/** The chain's own currency. */
export interface NativeRef {
  ref: "native";
  symbol: string;
  /** 18, or absent: `@token:amount` scales a native amount by the chain
   *  definition, so an amount is only written in the currency's units
   *  when that is known to be the usual 18. */
  decimals?: 18;
}

export interface AmountRef {
  ref: "amount";
  of: TokenRef | NativeRef;
  value: bigint;
  bound: AmountBound;
}

export type SuggestionRef = AddressRef | TokenRef | NativeRef | AmountRef;

/** A line before its addresses have names: EVML text and references. */
export type LineTemplate = readonly (string | SuggestionRef)[];

/** One suggested line, as a declaration returns it: written with `line`
 *  and `say`, over the same references. */
export interface Candidate {
  line: LineTemplate;
  sentence: SentencePart[];
  /** `state`: the value an event announced. `amount`: a number read on the
   *  fork, exact only while the balance does not move before execution. */
  kind: SuggestionKind;
}

export interface Suggestion {
  /** A complete EVML `assert` line. Its addresses are variables (`vars`),
   *  referenced only as `$name` tokens. */
  line: string;
  /** The variables the line uses, in order: a script sets each before the
   *  line (`suggestionScript`). */
  vars: { name: string; value: Address }[];
  /** One sentence for the person choosing, as parts a host can render. */
  sentence: SentencePart[];
  /** The same sentence as plain text. */
  description: string;
  kind: SuggestionKind;
  module: string;
  /** The declaration that produced it (`erc20Transfer`). */
  event: string;
  /** The contract that emitted the event (the account itself for a
   *  suggestion that comes from no event). */
  emitter: Address;
  /** The event as the contract names it (`Transfer`). Absent when the
   *  suggestion comes from no event. A host shows where a suggestion
   *  comes from with this and the emitter: what it asserts is what that
   *  contract says about itself, an event it emitted and a view it
   *  answered. */
  eventName?: string;
  /** The name the emitter gives itself, when it has a short plain one
   *  (a token's symbol). It is the contract's own word: show it with a
   *  way to see the address behind it. */
  emitterName?: string;
}

export interface RawLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}

/** Calls a view on the fork after the run. `undefined` when the contract
 *  has no such view: no code, a revert, a result that does not decode. */
export type ViewRead = (
  address: Address,
  signature: string,
  args?: readonly unknown[],
) => Promise<unknown | undefined>;

export interface SuggestEnv {
  chainId: number;
  /** The account whose balances are guarded. */
  executor: Address;
  /** The account that pays gas, when one does. */
  payer?: Address;
  /** Percent of a change an amount may fall short by. */
  tolerance: number;
  /** The batch executes as soon as it is signed, from the state it was
   *  simulated on (a wallet sending it itself): an amount is asserted at
   *  exactly what the run left, instead of a floor that leaves room for
   *  what can happen before a delayed execution. */
  exact?: boolean;
  /** The chain's own currency, as `@balance!` spells it. */
  nativeSymbol: string;
  /** Its decimals, from the chain's definition. Unknown, or anything but
   *  18, keeps native amounts in base units. */
  nativeDecimals?: number;
  read: ViewRead;
  /** What is known of a token, each part only when it could be read. */
  token?(address: Address): Promise<TokenInfo>;
  /** The short plain name a contract gives itself, when it has one. */
  emitterName?(address: Address): Promise<string | undefined>;
  /** Whether an address has code after the run, when that could be read.
   *  It names a variable nothing else names (`$contract`, `$account`). */
  hasCode?(address: Address): Promise<boolean | undefined>;
}

export interface TokenInfo {
  /** The token's own `symbol()`: a name to show, never to resolve. */
  symbol?: string;
  decimals?: number;
  /** The symbol the chain's token list resolves to exactly this token
   *  (`symbolInList`). It names the token's variable (`$usdc`); the line
   *  never writes it, because a symbol in a script is resolved again
   *  whenever the script runs, against whatever the list says then. */
  listed?: string;
}

export interface EventLogs {
  emitter: Address;
  /** Decoded args of every matching log of the run, in order. */
  logs: Record<string, any>[];
}

export interface EventDef {
  name: string;
  description: string;
  /** `event Name(type indexed name, ...)`: one literal, named inputs. */
  event: string;
  suggest(env: SuggestEnv, found: EventLogs): Promise<Candidate[]>;
}

export const defineEvent = (def: EventDef): EventDef => def;

export interface EventImportEntry {
  load: () => Promise<{ default: EventDef }>;
  event: string;
  description?: string;
}
export type EventImportMap = Record<string, EventImportEntry>;

/** The way an amount is asserted, which is the way it may be rounded
 *  when said: a floor (`>=`) down, a ceiling up, an exact value (`==`)
 *  not at all. Rounded the other way, the sentence would claim more than
 *  its line checks. */
export type AmountBound = "floor" | "exact" | "ceiling";

/** Dust: an amount that would print as a long run of zeros in its token's
 *  units. The one test of it, for what is said and for what is written. */
const isDust = (amount: bigint, decimals: number): boolean =>
  amount !== 0n && Number(formatUnits(amount, decimals)) < 0.000001;

/** How many decimals of an amount are said: every one of an exact value;
 *  for a floor and a ceiling, four from 1 up and four significant digits
 *  below 1. The one place that precision is decided: what a floor says
 *  and what it asserts are both cut here. */
function saidDecimals(
  amount: bigint,
  decimals: number,
  bound: AmountBound,
): number {
  if (bound === "exact") return decimals;
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  const leading = whole === "0" ? (fraction.match(/^0*/)?.[0].length ?? 0) : 0;
  return Math.min(decimals, leading + 4);
}

/** A floor at the precision it is said: rounded down, so it is lowered by
 *  less than one unit of its last digit and never raised. A floor that is
 *  not said in its token's units (dust) is left as it is. */
export function saidFloor(amount: bigint, decimals: number): bigint {
  if (isDust(amount, decimals)) return amount;
  const unit =
    10n ** BigInt(decimals - saidDecimals(amount, decimals, "floor"));
  return amount - (amount % unit);
}

/** An amount in its token's units, as a person would say the number:
 *  "51,950.2982", cut in the direction it is asserted. */
function unitsText(
  amount: bigint,
  decimals: number,
  bound: AmountBound,
): string {
  const kept = saidDecimals(amount, decimals, bound);
  const unit = 10n ** BigInt(decimals - kept);
  const cut =
    amount / unit + (bound === "ceiling" && amount % unit > 0n ? 1n : 0n);
  const [units, rest] = formatUnits(cut, kept).split(".");
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest ? `${grouped}.${rest}` : grouped;
}

/** An amount as a person would say it: "12.5 USDC", rounded the way it is
 *  asserted (`bound`). Dust is given in the token's base units instead:
 *  "5 base units of WETH". */
export function amountText(
  amount: bigint,
  decimals: number,
  symbol: string,
  bound: AmountBound = "exact",
): string {
  return isDust(amount, decimals)
    ? `${amount} base units of ${symbol}`
    : `${unitsText(amount, decimals, bound)} ${symbol}`;
}

/** A token's symbol as it may be shown: short and plain. A contract writes
 *  its own symbol, and a suggestion is read by someone deciding what to
 *  sign, so anything that could pass for more than a symbol (spaces, an
 *  address, a link, a line break) is refused and the caller shows the
 *  address instead. */
export function safeSymbol(raw: string): string | undefined {
  return /^[A-Za-z0-9.$_-]{1,12}$/.test(raw) ? raw : undefined;
}

/** Where a suggestion comes from, as one line of text: "Suggested by USDC
 *  (0x1234...abcd)'s Transfer event". The address is always there, because
 *  the name is the contract's own. For hosts that print text; one that can
 *  link the name to the address builds its own from the same fields.
 *  Undefined for a suggestion that comes from no event. */
export function suggestionSource(suggestion: Suggestion): string | undefined {
  if (!suggestion.eventName) return undefined;
  const address = truncateAddress(suggestion.emitter);
  const who = suggestion.emitterName
    ? `${suggestion.emitterName} (${address})`
    : address;
  return `Suggested by ${who}'s ${suggestion.eventName} event`;
}

/** An account: an address with no name of its own. `role` is what it is in
 *  the declaration (`spender`, `owner`, `recipient`), and names its
 *  variable. */
export const account = (address: string, role: string): AddressRef => ({
  ref: "address",
  address: getAddress(address),
  role,
});

/** A contract, with the name it gives itself when it has a short plain
 *  one. `role` must be neutral (`contract`, `proxy`, `registry`): what a
 *  contract is has not been checked, only what its views answer. */
export async function contract(
  env: SuggestEnv,
  address: string,
  role: string,
): Promise<AddressRef> {
  const at = getAddress(address);
  let raw: string | undefined;
  try {
    raw = await env.emitterName?.(at);
  } catch {
    // Unnamed.
  }
  const name = typeof raw === "string" ? safeSymbol(raw) : undefined;
  return { ref: "address", address: at, role, ...(name ? { name } : {}) };
}

/** A token, for `@balance!`, `@token:allowance!` and `amount`. */
export async function token(
  env: SuggestEnv,
  address: string,
): Promise<TokenRef> {
  const at = getAddress(address);
  let info: TokenInfo = {};
  try {
    info = (await env.token?.(at)) ?? {};
  } catch {
    // Nothing known: a plain address and base units.
  }
  const listed =
    typeof info.listed === "string" && PLAIN_WORD.test(info.listed)
      ? info.listed
      : undefined;
  // What is shown: the token's own word, or the list's when it has none.
  const name =
    (typeof info.symbol === "string" ? safeSymbol(info.symbol) : undefined) ??
    listed;
  const decimals =
    typeof info.decimals === "number" &&
    Number.isInteger(info.decimals) &&
    info.decimals >= 0 &&
    info.decimals <= 255
      ? info.decimals
      : undefined;
  return {
    ref: "token",
    address: at,
    role: "token",
    ...(name ? { name } : {}),
    ...(decimals !== undefined ? { decimals } : {}),
    ...(listed ? { listed } : {}),
  };
}

export const nativeCurrency = (env: SuggestEnv): NativeRef => ({
  ref: "native",
  symbol: env.nativeSymbol,
  ...(env.nativeDecimals === 18 ? { decimals: 18 as const } : {}),
});

/** An amount of a token, or of the chain's own currency, in base units.
 *  There is no way to state one without saying how it is asserted:
 *  - `atLeast`, for the right side of a `>=`. A floor is asserted at the
 *    precision it is said (`saidFloor`): the value it carries is already
 *    the rounded-down one, so the line, the sentence and `value` state one
 *    number. It can come out as nothing only if it was given nothing.
 *  - `exactly`, for an `==`: every digit, in the line and in the sentence.
 *  - `atMost`, for an upper bound that is only said: rounded up there. */
const bounded =
  (bound: AmountBound) =>
  (of: TokenRef | NativeRef, value: bigint): AmountRef => ({
    ref: "amount",
    of,
    value:
      bound === "floor" && of.decimals !== undefined
        ? saidFloor(value, of.decimals)
        : value,
    bound,
  });
export const atLeast = bounded("floor");
export const exactly = bounded("exact");
export const atMost = bounded("ceiling");

type Written = string | number | bigint | boolean;

const isRef = (value: unknown): value is SuggestionRef =>
  typeof value === "object" && value !== null && "ref" in value;

/** A 20-byte address written as text: still an address. */
const asAddress = (value: unknown): AddressRef | undefined =>
  typeof value === "string" &&
  value.length === 42 &&
  isAddress(value, { strict: false })
    ? account(value, "address")
    : undefined;

/** The name shown is the one the token list gives that address. */
const vouched = (ref: AddressRef | TokenRef): boolean =>
  ref.ref === "token" && !!ref.name && ref.name === ref.listed;

/** The decimals an amount is written and said in, or none when it stays
 *  in base units: its token does not say its decimals, or it is dust. The
 *  one place that is decided, so a line never says `@token:amount(…
 *  0.000000000000000005)` under a sentence that says "5 base units". */
function unitsOf({ of, value }: AmountRef): number | undefined {
  return of.decimals === undefined || isDust(value, of.decimals)
    ? undefined
    : of.decimals;
}

function amountPart(ref: AmountRef): AmountPart {
  const { of, value, bound } = ref;
  const symbol = of.ref === "native" ? of.symbol : of.name;
  const units = unitsOf(ref);
  const said =
    units === undefined
      ? `${value} base units`
      : unitsText(value, units, bound);
  return {
    type: "amount",
    value: String(value),
    bound,
    token: of.ref === "native" ? "native" : of.address,
    ...(symbol ? { symbol } : {}),
    ...(of.decimals !== undefined ? { decimals: of.decimals } : {}),
    ...(of.ref === "token" && vouched(of) ? { listed: true as const } : {}),
    // Without a symbol the number stands alone: the token's address
    // follows it wherever it is shown.
    text: !symbol
      ? said
      : units === undefined
        ? `${said} of ${symbol}`
        : `${said} ${symbol}`,
  };
}

/** Writes a sentence: `` say`${who} is an owner of ${target}` ``. A
 *  reference becomes a mention, anything else text; another sentence may
 *  be nested. */
export function say(
  strings: TemplateStringsArray,
  ...values: (Written | SuggestionRef | readonly SentencePart[])[]
): SentencePart[] {
  const out: SentencePart[] = [];
  const text = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };
  const add = (part: SentencePart) =>
    part.type === "text" ? text(part.text) : out.push(part);
  strings.forEach((chunk, i) => {
    text(chunk);
    if (i >= values.length) return;
    const value = values[i];
    if (Array.isArray(value)) {
      for (const part of value as SentencePart[]) add({ ...part });
      return;
    }
    const ref = isRef(value) ? value : asAddress(value);
    if (!ref) text(String(value));
    else if (ref.ref === "native") text(ref.symbol);
    else if (ref.ref === "amount") out.push(amountPart(ref));
    else
      out.push({
        type: "address",
        address: ref.address,
        ...(ref.name ? { name: ref.name } : {}),
        ...(vouched(ref) ? { listed: true as const } : {}),
      });
  });
  return out;
}

/** A sentence as plain text, for a host that prints: an address is
 *  truncated, a contract's own name and a token's symbol never stand
 *  alone (the address beside them is what tells a contract from one that
 *  borrowed its name). The one place a description is made. */
export function describeSentence(sentence: readonly SentencePart[]): string {
  return sentence
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "address") {
        const address = truncateAddress(part.address);
        return part.name ? `${part.name} (${address})` : address;
      }
      if (part.token === "native") return part.text;
      const address = truncateAddress(part.token);
      return part.symbol
        ? `${part.text} (${address})`
        : `${part.text} of ${address}`;
    })
    .join("");
}

/** Writes a line: `` line`assert @acl:owner!(${target}) == ${owner}` ``.
 *  A reference is rendered when the run's names are known
 *  (`toSuggestion`); anything else is EVML as written. */
export function line(
  strings: TemplateStringsArray,
  ...values: (Written | SuggestionRef)[]
): LineTemplate {
  const out: (string | SuggestionRef)[] = [];
  strings.forEach((chunk, i) => {
    if (chunk) out.push(chunk);
    if (i >= values.length) return;
    const value = values[i];
    out.push(isRef(value) ? value : (asAddress(value) ?? String(value)));
  });
  return out;
}

/** The one thing that can be read of an address nothing names: whether it
 *  has code. */
export type AddressKind = "account" | "contract";

/** The names of one run's variables: an address has one name, a name one
 *  address. */
export interface VariableNames {
  /** Tells what an address is about to be named for, before any name is
   *  given: an address that plays two roles in a run is named for
   *  neither. */
  seen(ref: AddressRef | TokenRef): void;
  nameOf(ref: AddressRef | TokenRef): string;
  /** The addresses seen and not named yet that no role and no list names:
   *  the ones worth asking about (`is`). */
  unnamed(): Address[];
  /** What was read of an address: it names it only when nothing else does. */
  is(address: Address, kind: AddressKind): void;
}

/** Names come from what an address is, never from what it says of
 *  itself: in a script `$usdc` reads as USDC, so the name a contract gives
 *  itself names no variable. The guarded account is `executor`; a token
 *  the chain's list resolves a symbol to takes that symbol (`usdc`);
 *  anything else takes the role its declaration gave it. When the run gave
 *  it more than one (an owner that is also a spender is not `$owner` in
 *  the line about what it may spend), or none that is a word, it is named
 *  by the one neutral thing that can be read of it: `account` without code,
 *  `contract` with it, and `address` when that is not known. A name
 *  already taken gets a number: `spender`, `spender2`. */
export function variableNames(executor?: Address): VariableNames {
  const named = new Map<Address, string>();
  const taken = new Set<string>();
  type About = { listed?: string; roles: Set<string> };
  const known = new Map<Address, About>();
  const kinds = new Map<Address, AddressKind>();
  const guarded = executor && getAddress(executor);
  /** The name before any number, or none when nothing names the address. */
  const given = (address: Address, { listed, roles }: About) => {
    const [role] = roles;
    return address === guarded
      ? "executor"
      : listed
        ? listed.toLowerCase()
        : roles.size === 1 && PLAIN_WORD.test(role)
          ? role
          : undefined;
  };
  const seen = (ref: AddressRef | TokenRef) => {
    const address = getAddress(ref.address);
    const about = known.get(address) ?? { roles: new Set<string>() };
    about.roles.add(ref.role);
    if (ref.ref === "token" && ref.listed && PLAIN_WORD.test(ref.listed))
      about.listed ??= ref.listed;
    known.set(address, about);
    return about;
  };
  return {
    seen: (ref) => void seen(ref),
    nameOf(ref) {
      const address = getAddress(ref.address);
      const has = named.get(address);
      if (has) return has;
      const base = given(address, seen(ref)) ?? kinds.get(address) ?? "address";
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
      taken.add(name);
      named.set(address, name);
      return name;
    },
    unnamed: () =>
      [...known]
        .filter(
          ([address, about]) =>
            !named.has(address) &&
            !kinds.has(address) &&
            given(address, about) === undefined,
        )
        .map(([address]) => address),
    is(address, kind) {
      if (kind === "account" || kind === "contract")
        kinds.set(getAddress(address), kind);
    },
  };
}

/** What follows a line whose amounts are in base units, before the tokens
 *  they are of: `assert … == 5  # base units of $weth`. */
export const BASE_UNITS_COMMENT = "  # base units of ";

/** The addresses a line names. */
const lineRefs = (template: LineTemplate): (AddressRef | TokenRef)[] =>
  template.flatMap((part) =>
    typeof part === "string" || part.ref === "native"
      ? []
      : part.ref !== "amount"
        ? [part]
        : part.of.ref === "token"
          ? [part.of]
          : [],
  );

/** A line with nothing named: every address literal, every amount in
 *  base units. Two candidates with the same one assert the same thing. */
const lineKey = (template: LineTemplate): string =>
  template
    .map((part) =>
      typeof part === "string"
        ? part
        : part.ref === "native"
          ? part.symbol
          : part.ref === "amount"
            ? String(part.value)
            : part.address,
    )
    .join("");

/** A candidate as a host receives it: the line written with the run's
 *  variable names and amounts in the token's own units; the description
 *  made from the sentence. */
export function toSuggestion(
  candidate: Candidate,
  names: VariableNames,
  source: Pick<Suggestion, "module" | "event" | "emitter"> &
    Partial<Pick<Suggestion, "eventName" | "emitterName">>,
): Suggestion {
  const vars: Suggestion["vars"] = [];
  const variable = (ref: AddressRef | TokenRef) => {
    const name = names.nameOf(ref);
    if (!vars.some((v) => v.name === name))
      vars.push({ name, value: getAddress(ref.address) });
    return `$${name}`;
  };
  // A token is its address, like any contract: only the chain's own
  // currency, which names no contract, is written as a symbol.
  const tokenWord = (of: TokenRef | NativeRef) =>
    of.ref === "native" ? of.symbol : variable(of);
  // The tokens whose amounts the line holds in base units.
  const inBaseUnits = new Set<string>();
  const written = candidate.line
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.ref === "address") return variable(part);
      if (part.ref !== "amount") return tokenWord(part);
      // In the token's own units, exactly: a base-unit number always has
      // a decimal of at most `decimals` places. In base units where the
      // sentence is (`unitsOf`); and nothing is nothing in any unit.
      const units = unitsOf(part);
      if (part.value === 0n) return "0";
      if (units === undefined) {
        inBaseUnits.add(tokenWord(part.of));
        return String(part.value);
      }
      return `@token:amount(${tokenWord(part.of)} ${formatUnits(part.value, units)})`;
    })
    .join("");
  // A bare integer does not say what it counts, so the line does: a
  // comment, which EVML ignores to the end of the line. It names the token
  // as the line does, by its variable, and a rename takes both.
  const text =
    inBaseUnits.size === 0
      ? written
      : `${written}${BASE_UNITS_COMMENT}${[...inBaseUnits].join(" and ")}`;
  return {
    line: text,
    vars,
    sentence: candidate.sentence,
    description: describeSentence(candidate.sentence),
    kind: candidate.kind,
    ...source,
  };
}

/** The suggestions of one run as a script that runs: the modules their
 *  helpers need, each variable set once, then the lines. A host with a
 *  script of its own inserts the same three things there instead, and
 *  renames a variable its script already uses
 *  (`renameSuggestionVariable`). */
export function suggestionScript(suggestions: readonly Suggestion[]): string {
  const modules = new Set<string>();
  const values = new Map<string, Address>();
  for (const { line: text, vars } of suggestions) {
    for (const [, module] of text.matchAll(/@([A-Za-z][A-Za-z0-9-]*):/g))
      modules.add(module);
    for (const { name, value } of vars) {
      const set = values.get(name);
      if (set && set !== value) {
        throw new Error(
          `$${name} stands for two addresses: these suggestions are not from one run`,
        );
      }
      values.set(name, value);
    }
  }
  return [
    ...[...modules].map((module) => `load ${module}`),
    ...[...values].map(([name, value]) => `set $${name} ${value}`),
    ...suggestions.map((s) => s.line),
  ].join("\n");
}

/** The suggestion with one variable under another name. A line references
 *  a variable only as a `$name` token, so this is all a rename takes. */
export function renameSuggestionVariable(
  suggestion: Suggestion,
  from: string,
  to: string,
): Suggestion {
  const token_ = new RegExp(
    `\\$${from.replace(/[^A-Za-z0-9_]/g, "\\$&")}(?![A-Za-z0-9_])`,
    "g",
  );
  return {
    ...suggestion,
    line: suggestion.line.replace(token_, () => `$${to}`),
    vars: suggestion.vars.map((v) =>
      v.name === from ? { ...v, name: to } : v,
    ),
  };
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return isAddress(a) && isAddress(b)
      ? getAddress(a) === getAddress(b)
      : a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/** The bound an amount check uses: the balance after the run, lowered by
 *  `tolerance` percent of what changed (rounded up), never below zero. */
export function floorAfter(
  before: bigint,
  after: bigint,
  tolerance: number,
): bigint {
  const change = after > before ? after - before : before - after;
  const bps = BigInt(Math.round(tolerance * 100));
  const slack = (change * bps + 9999n) / 10000n;
  return after > slack ? after - slack : 0n;
}

export interface CompanionView {
  address: Address;
  signature: string;
  args?: readonly unknown[];
  expect: unknown;
}

/** The candidate, when the view exists and says what the event announced. */
export async function stateCandidate(
  env: SuggestEnv,
  view: CompanionView,
  line: LineTemplate,
  sentence: SentencePart[],
): Promise<Candidate[]> {
  const got = await env.read(view.address, view.signature, view.args);
  if (got === undefined || !sameValue(got, view.expect)) return [];
  return [{ line, sentence, kind: "state" }];
}

/** How far above the simulated fee the real one is assumed to stay: a
 *  wallet pads the gas limit, and the price can rise before the
 *  transaction lands. The fee charged up front is limit × price, so both
 *  are covered here. */
export const GAS_ALLOWANCE_FACTOR = 3n;

/** What a run spent on gas, as far as the simulation knows. */
export interface RunGas {
  /** Fee the fork charged the executor (zero where the fork charges
   *  none): taken back out so only the value moved is measured. */
  paid: bigint;
  /** Fee the real transaction is assumed to cost at most. */
  allowance: bigint;
}

/** The executor's floor in the chain's own currency. The account that pays
 *  gas has the fee taken from the balance being asserted, and the fee is
 *  not known when the line is written: its floor leaves room for an
 *  assumed one (`gas.allowance`), and says so. Without that assumption it
 *  gets no floor. */
export function nativeFloor(
  env: SuggestEnv,
  before: bigint,
  after: bigint,
  gas?: RunGas,
): Candidate | null {
  const executor = account(env.executor, "executor");
  const coin = nativeCurrency(env);
  const pays = !!env.payer && sameValue(env.payer, env.executor);
  if (!pays) {
    if (after === 0n && before > 0n) return emptied(executor, coin);
    if (env.exact && after !== before) {
      const amount = exactly(coin, after);
      return {
        line: line`assert @balance!(${coin} ${executor}) == ${amount}`,
        sentence: say`${executor} keeps exactly ${amount}`,
        kind: "amount",
      };
    }
    const floor = atLeast(coin, floorAfter(before, after, env.tolerance));
    // `>= 0` holds whatever happens: it asserts nothing.
    if (floor.value === 0n) return null;
    return {
      line: line`assert @balance!(${coin} ${executor}) >= ${floor}`,
      sentence: say`${executor} keeps at least ${floor}`,
      kind: "amount",
    };
  }
  if (!gas || gas.allowance <= 0n) return null;
  const moved = floorAfter(before, after + gas.paid, env.tolerance);
  // A fee assumption that swallows the balance leaves `>= 0`: nothing.
  if (moved <= gas.allowance) return null;
  const floor = atLeast(coin, moved - gas.allowance);
  if (floor.value === 0n) return null;
  return {
    line: line`assert @balance!(${coin} ${executor}) >= ${floor}`,
    sentence: say`${executor} keeps at least ${floor}, after up to ${atMost(coin, gas.allowance)} for gas`,
    kind: "amount",
  };
}

/** An account the run emptied of a token: it holds none of it after. Any
 *  account that sends it some before a delayed execution makes this fail;
 *  the sentence says only what is checked, and a host says the rest. */
function emptied(who: AddressRef, coin: TokenRef | NativeRef): Candidate {
  return {
    line: line`assert @balance!(${coin} ${who}) == 0`,
    sentence: say`${who} is left with ${exactly(coin, 0n)}`,
    kind: "amount",
  };
}

/** How a balance check is written for one token: its line for an
 *  account, an operator and a number (`>=` a floor, `==` an exact amount),
 *  and the amount as said, or nothing when what it would write asserts
 *  nothing. */
export type BalanceCheck = (
  who: AddressRef,
  op: ">=" | "==",
  value: bigint,
) => { line: LineTemplate; amount: SentencePart[] } | null;

/** The balance checks one token gets after a run. `net` is each account's
 *  net change over the whole run, every transfer to it added and every
 *  transfer from it taken away, so an account that received three times
 *  gets one check of the sum; `read` answers its balance after the run.
 *
 *  - An account that sent and is left with none: `== 0`.
 *  - In `exact` mode, every account that moved, and the executor: `==` the
 *    balance after.
 *  - Otherwise a floor: for the executor (first), and for each account
 *    that gained. An account that only sent keeps no floor: what it holds
 *    is not this batch's to guard. */
export async function balanceChecks(
  env: SuggestEnv,
  net: Map<Address, bigint>,
  read: (account: Address) => Promise<unknown | undefined>,
  check: BalanceCheck,
  options: { executor?: boolean } = {},
): Promise<Candidate[]> {
  const executor = getAddress(env.executor);
  const withExecutor = options.executor ?? true;
  const accounts = [
    ...(withExecutor ? [executor] : []),
    ...[...net.keys()].filter(
      (a) => a !== executor && (net.get(a) ?? 0n) !== 0n,
    ),
  ];
  const out: Candidate[] = [];
  for (const address of accounts) {
    const change = net.get(address) ?? 0n;
    const own = address === executor;
    const after = await read(address);
    if (typeof after !== "bigint") continue;
    // A balance below what the transfers say was gained contradicts them:
    // the event is not confirmed.
    if (change > 0n && after < change) continue;
    const who = account(
      address,
      own ? "executor" : change > 0n ? "recipient" : "sender",
    );
    if (change < 0n && after === 0n) {
      const written = check(who, "==", 0n);
      if (!written) continue;
      out.push({
        line: written.line,
        sentence: say`${who} is left with ${written.amount}`,
        kind: "amount",
      });
      continue;
    }
    if (env.exact) {
      const written = check(who, "==", after);
      if (!written) continue;
      out.push({
        line: written.line,
        sentence:
          change <= 0n
            ? say`${who} keeps exactly ${written.amount}`
            : say`${who} holds exactly ${written.amount}`,
        kind: "amount",
      });
      continue;
    }
    if (!own && change < 0n) continue;
    const floor = floorAfter(after - change, after, env.tolerance);
    // `>= 0` holds whatever happens: it asserts nothing.
    if (floor === 0n) continue;
    const written = check(who, ">=", floor);
    if (!written) continue;
    out.push({
      line: written.line,
      sentence:
        change <= 0n
          ? say`${who} keeps at least ${written.amount}`
          : say`${who} holds at least ${written.amount}`,
      kind: "amount",
    });
  }
  return out;
}

/** The checks of the chain's own currency for the accounts other than the
 *  executor whose balance the run changed, from their balance before and
 *  after (`balances`). Plain transfers of it leave no event, so a host
 *  reads the balances of the accounts a run names. The executor and the
 *  account that pays gas are left to `nativeFloor`. */
export async function nativeBalances(
  env: SuggestEnv,
  balances: { address: Address; before: bigint; after: bigint }[],
): Promise<Candidate[]> {
  const coin = nativeCurrency(env);
  const skip = new Set(
    [env.executor, env.payer].filter(Boolean).map((a) => getAddress(a!)),
  );
  const net = new Map<Address, bigint>();
  const after = new Map<Address, bigint>();
  for (const b of balances) {
    const address = getAddress(b.address);
    if (skip.has(address) || b.after === b.before) continue;
    net.set(address, b.after - b.before);
    after.set(address, b.after);
  }
  return balanceChecks(
    env,
    net,
    async (address) => after.get(address),
    (who, op, value) => {
      if (op === "==" && value === 0n)
        return {
          line: line`assert @balance!(${coin} ${who}) == 0`,
          amount: say`${exactly(coin, 0n)}`,
        };
      const amount = op === "==" ? exactly(coin, value) : atLeast(coin, value);
      if (amount.value === 0n) return null;
      return {
        line: line`assert @balance!(${coin} ${who}) ${op} ${amount}`,
        amount: say`${amount}`,
      };
    },
    { executor: false },
  );
}

/** How many of a run's logs are looked at. A run can emit any number of
 *  them and each may cost a read, so the work is bounded here; the logs
 *  past the bound suggest nothing. */
export const MAX_SUGGESTION_LOGS = 500;

/** A reader that answers a bounded number of times. One log can ask for
 *  many reads (a batch transfer, one per id), so bounding the logs does
 *  not bound the work: past the budget every view reads as missing, which
 *  drops the candidates that needed it, and `exhausted` says it happened. */
export function budgetedRead(
  read: ViewRead,
  budget: number,
): {
  read: ViewRead;
  /** Takes one read out of the budget for something that is not a view
   *  (an account's code): false when there is none left. */
  charge(): boolean;
  exhausted(): boolean;
} {
  let left = budget;
  let exhausted = false;
  const charge = () => {
    if (left <= 0) {
      exhausted = true;
      return false;
    }
    left--;
    return true;
  };
  return {
    read: async (address, signature, args) =>
      charge() ? read(address, signature, args) : undefined,
    charge,
    exhausted: () => exhausted,
  };
}

/** How many view reads one run's suggestions may cost. */
export const MAX_SUGGESTION_READS = 2000;

export async function collectSuggestions(input: {
  modules: { name: string; events: EventImportMap }[];
  logs: readonly RawLog[];
  env: SuggestEnv;
  /** The run's variable names, when the caller adds suggestions of its
   *  own to these (`toSuggestion`) and they must share them. */
  names?: VariableNames;
}): Promise<Suggestion[]> {
  // Every candidate is gathered before any is written: a variable's name
  // depends on all the roles its address plays in the run.
  const found: {
    candidate: Candidate;
    source: Parameters<typeof toSuggestion>[2];
  }[] = [];
  const seen = new Set<string>();
  const varNames = input.names ?? variableNames(input.env.executor);
  const runLogs = input.logs.slice(0, MAX_SUGGESTION_LOGS);
  // What a contract says of itself is asked once per address, however many
  // declarations mention it, and is never the reason a suggestion is lost.
  const once = <T>(ask: (address: Address) => Promise<T>, none: T) => {
    const asked = new Map<Address, Promise<T>>();
    return (address: Address) => {
      let answer = asked.get(address);
      if (!answer) {
        answer = (async () => ask(address))().catch(() => none);
        asked.set(address, answer);
      }
      return answer;
    };
  };
  const nameOf = once<string | undefined>(
    async (address) => input.env.emitterName?.(address),
    undefined,
  );
  const env: SuggestEnv = {
    ...input.env,
    emitterName: nameOf,
    token: once<TokenInfo>(
      async (address) => (await input.env.token?.(address)) ?? {},
      {},
    ),
  };
  for (const { name: module, events } of input.modules) {
    for (const [event, entry] of Object.entries(events)) {
      // A declaration that does not parse or does not load loses only
      // itself: suggestions are an extra, and never the reason a run fails.
      let abi: AbiEvent;
      try {
        abi = parseAbiItem(entry.event) as AbiEvent;
      } catch {
        continue;
      }
      const topic0 = toEventSelector(abi);
      const topicCount = 1 + abi.inputs.filter((i) => i.indexed).length;
      const byEmitter = new Map<Address, Record<string, any>[]>();
      for (const log of runLogs) {
        if (log.topics[0] !== topic0 || log.topics.length !== topicCount)
          continue;
        try {
          const { args } = decodeEventLog({
            abi: [abi],
            topics: log.topics as [Hex, ...Hex[]],
            data: log.data,
            strict: true,
          });
          const emitter = getAddress(log.address);
          byEmitter.set(emitter, [
            ...(byEmitter.get(emitter) ?? []),
            args as Record<string, any>,
          ]);
        } catch {
          // Same topic0, another event: not this declaration's.
        }
      }
      if (byEmitter.size === 0) continue;
      let def: EventDef;
      try {
        def = (await entry.load()).default;
      } catch {
        continue;
      }
      for (const [emitter, logs] of byEmitter) {
        let candidates: Candidate[];
        try {
          candidates = await def.suggest(env, { emitter, logs });
        } catch {
          continue;
        }
        for (const candidate of candidates) {
          // A candidate that cannot be written loses only itself.
          try {
            const key = lineKey(candidate.line);
            if (seen.has(key)) continue;
            seen.add(key);
            lineRefs(candidate.line).forEach(varNames.seen);
            const emitterName = await nameOf(emitter);
            found.push({
              candidate,
              source: {
                module,
                event,
                emitter,
                eventName: abi.name,
                ...(emitterName ? { emitterName } : {}),
              },
            });
          } catch {}
        }
      }
    }
  }
  // What nothing names is asked whether it has code, once each, after
  // every declaration has read what it needed: a name is the last thing a
  // run's reads are spent on.
  if (input.env.hasCode) {
    const hasCode = once<boolean | undefined>(
      async (address) => input.env.hasCode?.(address),
      undefined,
    );
    for (const address of varNames.unnamed()) {
      const code = await hasCode(address);
      if (typeof code === "boolean")
        varNames.is(address, code ? "contract" : "account");
    }
  }
  return found.flatMap(({ candidate, source }) => {
    try {
      return [toSuggestion(candidate, varNames, source)];
    } catch {
      return [];
    }
  });
}
