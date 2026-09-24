import type { BoxCountdown, BoxHandle, WatchContext } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { explorerAddressLink } from "../venues/lib/cowApi";
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
  /** CoW Explorer links to the settlements seen so far, by label. */
  settlements: Record<string, string>;
}

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
  const settlements: Record<string, string> = {};
  if (page)
    for (const item of items)
      if (item.settlement)
        settlements[`Part ${item.index + 1} settlement`] =
          item.settlement.explorer;
  return { status, settlements };
}

const utc = (seconds: string) =>
  `${new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** " at HH:MM UTC" for when the current part opened, from the schedule's
 *  start and its even split up to the end. Empty when unknown. */
const partStart = (s: TwapStatus): string => {
  const index = s.submission.partIndex;
  if (index === null || !s.start || !s.end || s.totalParts <= 0) return "";
  const start = Number(s.start);
  const interval = (Number(s.end) - start) / s.totalParts;
  const at = new Date((start + index * interval) * 1000).toISOString();
  return ` at ${at.slice(11, 16)} UTC`;
};

/** What the order waits for next, from its schedule: the start, the next
 *  part, or the end of the last part's interval. None once it has ended or
 *  while the schedule is unknown. */
export const twapCountdown = (s: TwapStatus): BoxCountdown | null => {
  if (!s.start || !s.end || s.totalParts <= 0) return null;
  const start = Number(s.start);
  const end = Number(s.end);
  const interval = (end - start) / s.totalParts;
  if (s.schedule === "scheduled")
    return { label: "Starts in", from: start, until: start, segment: 0 };
  if (s.schedule !== "active" && s.schedule !== "between-windows") return null;
  const index = s.submission.partIndex;
  if (index === null) return null;
  const from = start + index * interval;
  return index + 1 < s.totalParts
    ? { label: "Next part in", from, until: from + interval, segment: index }
    : { label: "Ends in", from, until: end, segment: index };
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
  } = {},
): Promise<void> {
  if (outcome.kind === "not-sent") return box.done("Prepared, not sent");
  // Queued in a Safe, or sent by a host that returned no receipt: it may
  // still register, just out of this box's sight.
  if (outcome.kind === "unknown")
    return box.done(`${outcome.reason}; check it later with @swaps:twapStatus`);
  if (outcome.kind !== "confirmed")
    return box.fail(`Not registered: ${outcome.reason}`);
  if (simulated)
    return box.done("Registered (simulated; parts are not executed in a fork)");
  const custom = options.status;
  const read = custom
    ? async (): Promise<Reading> => ({
        status: await custom(client, ref),
        settlements: {},
      })
    : () => readTwap(client, ref, box.signal);
  box.update({
    links: { Orders: explorerAddressLink(ref.chainId, ref.account) },
  });
  let seenRegistered = false;
  let unregisteredPolls = 0;
  let unverifiedPolls = 0;
  await box.poll(
    async () => {
      const reading = await read();
      if (!reading) return "stop";
      const { status: s, settlements } = reading;
      const progress: [number, number] = [s.filledParts, s.totalParts];
      const executed = `${s.filledParts}/${s.totalParts} executed`;
      const unknown = s.filled === "unknown";
      const reason = s.evidence?.reasons?.[0] ?? "fill history unavailable";
      // Completion first: recovering a finished order also removes it.
      if (s.filled === "complete") {
        box.update({ links: settlements, progress });
        box.done(`Finished: ${s.totalParts}/${s.totalParts} executed`);
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
          box.update({ links: settlements });
          end(`${ending}; fill count could not be verified: ${reason}`);
          return "stop";
        }
        box.update({ links: settlements, progress });
        end(
          removed
            ? `${ending} after ${executed}`
            : `Ended: ${executed}, ${s.totalParts - s.filledParts} expired`,
        );
        return "stop";
      }
      unverifiedPolls = 0;
      const links = {
        ...settlements,
        ...(s.submission.explorer
          ? { "Current part": s.submission.explorer }
          : {}),
      };
      const detail = !s.registered
        ? "Waiting for the order to appear on-chain"
        : s.schedule === "scheduled" && s.start
          ? `Scheduled, part 1 of ${s.totalParts} at ${utc(s.start)}`
          : unknown
            ? `Fills unknown: ${reason}`
            : s.filledParts === 0
              ? `Started, part ${(s.submission.partIndex ?? 0) + 1} of ${s.totalParts}${partStart(s)}`
              : executed;
      const countdown = s.registered ? twapCountdown(s) : null;
      box.update(
        unknown
          ? { detail, links, countdown }
          : { detail, progress, links, countdown },
      );
      return "continue";
    },
    { every: options.every ?? twapWatchTiming.every },
  );
}
