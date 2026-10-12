import type { AbiEvent, Address, Hex } from "viem";
import {
  decodeEventLog,
  getAddress,
  isAddress,
  parseAbiItem,
  toEventSelector,
} from "viem";
import { truncateAddress } from "./format";

/**
 * Assertions suggested from a simulated run. A module declares the events
 * it recognises (`src/events/<name>.ts`, `defineEvent`); the simulation
 * matches the run's logs against them and each declaration answers with
 * the `assert` lines its companion views confirm.
 */

export type SuggestionKind = "state" | "amount";

/** One suggested line, as a declaration returns it. */
export interface Candidate {
  /** A complete EVML `assert` line. */
  line: string;
  /** One sentence for the person choosing. */
  description: string;
  /** `state`: the value an event announced. `amount`: a number read on the
   *  fork, exact only while the balance does not move before execution. */
  kind: SuggestionKind;
}

export interface Suggestion extends Candidate {
  module: string;
  event: string;
  emitter: Address;
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
  /** The chain's own currency, as `@balance!` spells it. */
  nativeSymbol: string;
  read: ViewRead;
  /** "12.5 USDC" */
  formatAmount(token: Address, amount: bigint): Promise<string>;
  /** "USDC", or the address when the token has no symbol. */
  tokenName(token: Address): Promise<string>;
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

/** A token's symbol as it may be shown: short and plain. A contract writes
 *  its own symbol, and a suggestion is read by someone deciding what to
 *  sign, so anything that could pass for more than a symbol (spaces, an
 *  address, a link, a line break) is refused and the caller shows the
 *  address instead. */
export function safeSymbol(raw: string): string | undefined {
  return /^[A-Za-z0-9.$_-]{1,12}$/.test(raw) ? raw : undefined;
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
  line: string,
  description: string,
): Promise<Candidate[]> {
  const got = await env.read(view.address, view.signature, view.args);
  if (got === undefined || !sameValue(got, view.expect)) return [];
  return [{ line, description, kind: "state" }];
}

/** The executor's floor in the chain's own currency. None for the account
 *  that pays gas: the fee comes out of the balance being asserted and is
 *  not known when the line is written. */
export function nativeFloor(
  env: SuggestEnv,
  before: bigint,
  after: bigint,
): Candidate | null {
  if (env.payer && sameValue(env.payer, env.executor)) return null;
  const executor = getAddress(env.executor);
  return {
    line: `assert @balance!(${env.nativeSymbol} ${executor}) >= ${floorAfter(before, after, env.tolerance)}`,
    description: `${env.nativeSymbol} balance of ${truncateAddress(executor)} stays at or above the simulated amount`,
    kind: "amount",
  };
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
): { read: ViewRead; exhausted(): boolean } {
  let left = budget;
  let exhausted = false;
  return {
    read: async (address, signature, args) => {
      if (left <= 0) {
        exhausted = true;
        return undefined;
      }
      left--;
      return read(address, signature, args);
    },
    exhausted: () => exhausted,
  };
}

/** How many view reads one run's suggestions may cost. */
export const MAX_SUGGESTION_READS = 2000;

export async function collectSuggestions(input: {
  modules: { name: string; events: EventImportMap }[];
  logs: readonly RawLog[];
  env: SuggestEnv;
}): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const runLogs = input.logs.slice(0, MAX_SUGGESTION_LOGS);
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
          candidates = await def.suggest(input.env, { emitter, logs });
        } catch {
          continue;
        }
        for (const candidate of candidates) {
          if (seen.has(candidate.line)) continue;
          seen.add(candidate.line);
          // What a suggestion asserts is what the emitter says about
          // itself: an event it emitted, a view it answered. Saying so in
          // every description is what keeps one from reading as a fact
          // about a contract the reader has not looked at.
          out.push({
            ...candidate,
            description: `${candidate.description}, as reported by ${truncateAddress(emitter)}`,
            module,
            event,
            emitter,
          });
        }
      }
    }
  }
  return out;
}
