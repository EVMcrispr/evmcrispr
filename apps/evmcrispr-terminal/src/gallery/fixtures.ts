/** What the compositions are made of. Fixed, so the gallery looks the
 *  same on every load apart from relative times. */
export const NOW = Date.now();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SPACES = [
  {
    id: "a",
    title: "Fund the grants Safe",
    updatedAt: NOW - 10 * MINUTE,
    unreviewed: true,
    run: "paused" as const,
  },
  {
    id: "b",
    title: "Swap on Gnosis",
    updatedAt: NOW - 3 * HOUR,
    unreviewed: false,
    run: undefined,
  },
  {
    id: "c",
    title:
      "Rebalance the treasury across three vaults and bridge the remainder to Gnosis",
    updatedAt: NOW - 4 * DAY,
    unreviewed: false,
    run: "watching" as const,
  },
  {
    id: "d",
    title: "Untitled: exec @token(GNO) approve",
    updatedAt: NOW - 20 * DAY,
    unreviewed: false,
    run: undefined,
  },
];

export const RUN_MARK = {
  running: "running",
  paused: "run paused",
  watching: "watching",
} as const;

export const REVISIONS = [
  {
    id: "r1",
    who: "You",
    what: "edited the script",
    added: 14,
    removed: 0,
    ts: NOW - 5 * HOUR,
    shared: true,
    unreviewed: false,
  },
  {
    id: "r2",
    who: "You",
    what: "edited the script",
    added: 3,
    removed: 2,
    ts: NOW - 2 * HOUR,
    shared: false,
    unreviewed: false,
  },
  {
    id: "r3",
    who: "Assistant",
    what: "split the transfer in two and added the 0.3% fee before the swap",
    added: 6,
    removed: 1,
    ts: NOW - 12 * MINUTE,
    shared: false,
    unreviewed: true,
  },
];

export const SCRIPT = `# Fund the grants Safe
set $safe 0x4f2083f5fBede34C2714aFfb3105539775f7FE64
set $amount 2500e18
exec @token(WXDAI) transfer $safe $amount`;

export const RUN_LOG = `> Sending 2,500 WXDAI to the grants Safe
  waiting for your wallet`;

export const DIFF = `  set $amount 2500e18
- exec @token(WXDAI) transfer $safe $amount
+ set $fee @calc($amount * 3 / 1000)
+ exec @token(WXDAI) transfer $safe @calc($amount - $fee)
+ exec @token(WXDAI) transfer @me $fee`;
