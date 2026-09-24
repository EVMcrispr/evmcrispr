import type {
  BoxCountdown,
  BoxHandle,
  BoxStep,
  WatchContext,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { formatUnits } from "viem";
import { decodeSchedule } from "./cow";
import type { ObservationBlock } from "./evidence";
import { twapSnapshot } from "./status";
import type { TwapReference, TwapStatus } from "./types";

/** Mutable so tests can shorten the interval. */
export const twapWatchTiming = { every: 60_000 };

/** Largest part page `twapSnapshot` reads in one call. */
const MAX_PAGE = 128;
/** Polls an order may read as unregistered before it was ever seen
 *  registered (RPC lag behind the confirming node) before the box ends. */
const REGISTRATION_GRACE = 5;
/** Polls an ended order gets to complete its fill evidence before the box
 *  ends with an unverified count (about five minutes at the default
 *  interval). */
const EVIDENCE_POLLS = 5;

interface Reading {
  status: TwapStatus;
  /** Each part's state, linking settled ones to their order on CoW
   *  Explorer. Empty when the order is too long to read in one page. */
  steps: BoxStep[];
}

/** A part as a bar step: executed (linked to its order), missed (its
 *  window closed unexecuted), open (its window is running) or pending. A
 *  closed window with incomplete fill history stays pending: it may have
 *  executed. `current` marks the part whose window is running, executed
 *  early or not. */
export const partStep = (item: {
  window: string;
  filled: string;
  explorer: string;
}): BoxStep => {
  const current = item.window === "active";
  const step: BoxStep =
    item.filled === "complete"
      ? { state: "done", href: item.explorer }
      : current
        ? { state: "open" }
        : item.window === "expired" && item.filled === "none"
          ? { state: "missed" }
          : { state: "pending" };
  return current ? { ...step, current } : step;
};

/** Status plus a settlement link per filled part. Orders of up to 128
 *  parts are read as one page so every settlement is linked; longer ones
 *  read only the current part and link no settlements. Null when the box
 *  ended during the block read; once it ends, the snapshot throws before
 *  its next CoW API call, so a running read makes none after it stops. */
async function readTwap(
  client: PublicClient,
  ref: TwapReference,
  signal: AbortSignal,
): Promise<Reading | null> {
  const parts = Number(decodeSchedule(ref.params).n);
  const page =
    parts <= MAX_PAGE ? { offset: 0, limit: Math.max(parts, 1) } : undefined;
  const block = (await client.getBlock()) as ObservationBlock;
  if (signal.aborted) return null;
  const { status, items } = await twapSnapshot(
    client,
    ref,
    { external: true, block, signal },
    page,
  );
  const steps = page
    ? [...items].sort((a, b) => a.index - b.index).map(partStep)
    : [];
  return { status, steps };
}

const utc = (seconds: string) =>
  `${new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** What the order waits for next, from its schedule. Segments open on a
 *  fixed schedule, whatever happens to the previous one: before the start
 *  and after the running segment executed, the next one's opening; while
 *  the running segment has not executed, its closing. None once it has
 *  ended, or when the schedule is unknown. `steps` tells whether the
 *  running segment executed (without them, the next opening is counted).
 *  The countdown spans the running segment's window, which hosts use to
 *  grow its bar. */
export const twapCountdown = (
  s: TwapStatus,
  steps: BoxStep[] = [],
): BoxCountdown | null => {
  if (!s.start || !s.end || s.totalParts <= 0) return null;
  const start = Number(s.start);
  const end = Number(s.end);
  const interval = (end - start) / s.totalParts;
  const next = (from: number, until: number): BoxCountdown => ({
    label: "Next segment starts in",
    due: "Next segment opening now",
    from,
    until,
  });
  if (s.schedule === "scheduled")
    return {
      label: "First segment starts in",
      due: "First segment opening now",
      from: start,
      until: start,
    };
  if (s.schedule !== "active" && s.schedule !== "between-windows") return null;
  const index = s.submission.partIndex;
  if (index === null) return null;
  const from = start + index * interval;
  const until = index + 1 < s.totalParts ? from + interval : end;
  if (steps[index]?.state === "open")
    return {
      label: "Segment closes in",
      due: "Segment closing now",
      from,
      until,
    };
  return index + 1 < s.totalParts ? next(from, until) : null;
};

/** A price reads with 5 significant digits: "2,709.5". */
const price = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 });

/** The average price of what executed, as "2,709.5 USDC/WETH": oriented so
 *  the number is at least 1, whichever token was sold. */
export const averagePrice = (
  sold: bigint,
  bought: bigint,
  tokens: {
    sell: { symbol: string; decimals: number };
    buy: { symbol: string; decimals: number };
  },
): string | undefined => {
  const s = Number(formatUnits(sold, tokens.sell.decimals));
  const b = Number(formatUnits(bought, tokens.buy.decimals));
  if (!(s > 0 && b > 0)) return undefined;
  return s / b >= 1
    ? `${price.format(s / b)} ${tokens.sell.symbol}/${tokens.buy.symbol}`
    : `${price.format(b / s)} ${tokens.buy.symbol}/${tokens.sell.symbol}`;
};

/** A TWAP box from its registration's outcome to the end of its schedule. */
export async function watchTwap(
  box: BoxHandle,
  client: PublicClient,
  ref: TwapReference,
  { outcome, simulated }: WatchContext,
  options: {
    every?: number;
    status?: (client: PublicClient, ref: TwapReference) => Promise<TwapStatus>;
    /** The sold and bought tokens, for the average price. */
    tokens?: {
      sell: { symbol: string; decimals: number };
      buy: { symbol: string; decimals: number };
    };
  } = {},
): Promise<void> {
  // Opened `showWhenConfirmed`: it shows only once the registration is
  // confirmed, after the transaction that carries it. Otherwise that
  // transaction's box already says why, and this one ends unseen.
  if (outcome.kind === "not-sent") return box.done("Prepared, not sent");
  // Queued in a Safe, or sent by a host that returned no receipt: it may
  // still register, just out of this box's sight.
  if (outcome.kind === "unknown")
    return box.done(`${outcome.reason}; check it later with @swaps:twapStatus`);
  if (outcome.kind !== "confirmed")
    return box.fail(`Not registered: ${outcome.reason}`);
  if (simulated)
    return box.done("Registered (simulated; nothing settles in a fork)");
  const tokens = options.tokens;
  /** "Executed 1/4 (avg 2,709 USDC/WETH)". */
  const executedText = (s: TwapStatus) => {
    const price =
      tokens && s.filledParts > 0
        ? averagePrice(
            BigInt(s.executedSellAmount),
            BigInt(s.executedBuyAmount),
            tokens,
          )
        : undefined;
    return `Executed ${s.filledParts}/${s.totalParts}${price ? ` (avg ${price})` : ""}`;
  };
  const custom = options.status;
  const read = custom
    ? async (): Promise<Reading> => ({
        status: await custom(client, ref),
        steps: [],
      })
    : () => readTwap(client, ref, box.signal);
  let seenRegistered = false;
  let unregisteredPolls = 0;
  let unverifiedPolls = 0;
  await box.poll(
    async () => {
      const reading = await read();
      if (!reading) return "stop";
      const { status: s, steps } = reading;
      const progress: [number, number] = [s.filledParts, s.totalParts];
      const executed = executedText(s);
      const unknown = s.filled === "unknown";
      const reason = s.evidence?.reasons?.[0] ?? "fill history unavailable";
      // Completion first: recovering a finished order also removes it.
      if (s.filled === "complete") {
        box.update({ steps, progress });
        box.done(executed);
        return "stop";
      }
      if (s.registered) {
        seenRegistered = true;
        unregisteredPolls = 0;
      } else unregisteredPolls++;
      // A confirmed registration that reads as unregistered was removed,
      // even when its history (and so `cancelled`) could not be read.
      const removed =
        !s.registered &&
        (s.cancelled === true ||
          seenRegistered ||
          unregisteredPolls > REGISTRATION_GRACE);
      if (removed || s.schedule === "expired") {
        const ending = removed
          ? s.cancelled
            ? "Cancelled on-chain"
            : "No longer registered on-chain"
          : "Ended";
        // Removed for certain (not merely never seen): the box ends ⊘.
        const end = (detail: string) =>
          removed && (s.cancelled === true || seenRegistered)
            ? box.cancel(detail)
            : box.done(detail);
        if (unknown) {
          // Incomplete evidence is not a final count: keep reading it.
          if (++unverifiedPolls < EVIDENCE_POLLS) {
            box.update({ detail: `${ending}; confirming fills…` });
            return "continue";
          }
          box.update({ steps });
          end(`${ending}; fill count could not be verified: ${reason}`);
          return "stop";
        }
        box.update({ steps, progress });
        end(
          removed
            ? `${ending} after ${executed.replace("Executed", "executing")}`
            : `${executed}, ${s.totalParts - s.filledParts} expired`,
        );
        return "stop";
      }
      unverifiedPolls = 0;
      const detail = !s.registered
        ? "Waiting for the order to appear on-chain"
        : s.schedule === "scheduled" && s.start
          ? `Starts at ${utc(s.start)}`
          : unknown
            ? `Fills unknown: ${reason}`
            : executed;
      const countdown = s.registered ? twapCountdown(s, steps) : null;
      box.update(
        unknown
          ? { detail, countdown }
          : { detail, progress, steps, countdown },
      );
      return "continue";
    },
    { every: options.every ?? twapWatchTiming.every },
  );
}
