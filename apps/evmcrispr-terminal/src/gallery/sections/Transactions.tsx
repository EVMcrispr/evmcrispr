import { BoxCard, Console, type ConsoleEntry } from "@evmcrispr/editor";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import { Badge, Button, Card, Time } from "@repo/ui";
import { useState } from "react";
import { Both, Example, Section } from "../kit";

const NOW_MS = Date.now();
const NOW = Math.floor(NOW_MS / 1000);
const TX = "https://gnosisscan.io/tx/0x8f3c";
const ORDER = "https://explorer.cow.fi/gc/orders/0x51d2";

const box = (
  id: string,
  state: BoxSnapshot["state"],
  title: string,
  detail: string,
  more: Partial<BoxSnapshot> = {},
): BoxSnapshot => ({
  id,
  state,
  title,
  detail,
  history: [],
  simulated: false,
  ...more,
});

const TRANSFER = "Transfer 2,500 WXDAI to grants.eth";

const PENDING = box("pending", "live", TRANSFER, "Waiting for wallet…");
const DECLINED = box("declined", "live", TRANSFER, "Declined in wallet");
const PAUSED = box("paused", "live", TRANSFER, "Paused");
const EXECUTED = box("executed", "done", TRANSFER, "Confirmed", {
  links: { Transaction: TX },
  history: ["Waiting for wallet…"],
});
const FAILED = box("failed", "failed", "Swap 250 WXDAI for GNO", "Reverted", {
  links: { Transaction: TX },
  history: ["Waiting for wallet…"],
});
const UNKNOWN = box(
  "unknown",
  "cancelled",
  "Approve 250 WXDAI to the router",
  "Sent; outcome unknown",
  { links: { Transaction: TX } },
);
const SIMULATED = box("simulated", "done", TRANSFER, "Confirmed", {
  simulated: true,
});

const TWAP = "TWAP 4 USDC → WETH";

const TWAP_WAITING = box("twap-0", "live", TWAP, "Waiting for execution", {
  progress: [0, 4],
  steps: [
    { state: "pending", current: true },
    { state: "pending" },
    { state: "pending" },
    { state: "pending" },
  ],
  countdown: {
    label: "First segment starts in",
    due: "First segment opening now",
    from: NOW - 60,
    until: NOW + 240,
    segment: 0,
  },
  links: { Order: ORDER },
});
const TWAP_RUNNING = box(
  "twap-1",
  "live",
  TWAP,
  "Executed 1/4 (avg 2,709 USDC/WETH)",
  {
    progress: [1, 4],
    steps: [
      { state: "done", href: TX },
      { state: "open", current: true },
      { state: "pending" },
      { state: "pending" },
    ],
    countdown: {
      label: "Segment closes in",
      due: "Segment closing now",
      from: NOW - 500,
      until: NOW + 400,
      segment: 1,
    },
    links: { Order: ORDER },
  },
);
const TWAP_MISSED = box(
  "twap-2",
  "live",
  TWAP,
  "Executed 2/4 (avg 2,712 USDC/WETH)",
  {
    progress: [2, 4],
    steps: [
      { state: "done", href: TX },
      { state: "missed" },
      { state: "done", href: TX, current: true },
      { state: "pending" },
    ],
    countdown: {
      label: "Next segment starts in",
      due: "Next segment opening now",
      from: NOW - 700,
      until: NOW + 200,
      segment: 2,
    },
    links: { Order: ORDER },
  },
);
const TWAP_DONE = box(
  "twap-3",
  "done",
  TWAP,
  "Executed 4/4 (avg 2,714 USDC/WETH)",
  {
    progress: [4, 4],
    steps: [
      { state: "done", href: TX },
      { state: "done", href: TX },
      { state: "done", href: TX },
      { state: "done", href: TX },
    ],
    links: { Order: ORDER },
  },
);
const TWAP_CANCELLED = box(
  "twap-4",
  "cancelled",
  TWAP,
  "Cancelled after executing 1/4 (avg 2,709 USDC/WETH)",
  {
    progress: [1, 4],
    steps: [
      { state: "done", href: TX },
      { state: "missed" },
      { state: "pending" },
      { state: "pending" },
    ],
    links: { Order: ORDER },
  },
);

/** What a simulated run printed, in order: lines, boxes, expectations. */
const OUTPUT: ConsoleEntry[] = [
  { kind: "line", text: "Forking Gnosis at block 42,118,507" },
  { kind: "line", text: "Balance before: 3,120.5 WXDAI" },
  { kind: "box", box: { ...EXECUTED, id: "out-1", simulated: true } },
  { kind: "line", text: ":success: Assertion passed" },
  { kind: "line", text: ":error: Assertion failed" },
  {
    kind: "line",
    text: ":waiting: Waiting for 0x4f20…FE64 to execute transaction...",
  },
  {
    kind: "line",
    text: ":success: All transactions succeeded in-browser (Revm/WASM).",
  },
];

// The boxes here are the fixtures above, so they are drawn the way a
// run of this page is: with their links.
function Boxes({ boxes }: { boxes: BoxSnapshot[] }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {boxes.map((snapshot) => (
        <BoxCard key={snapshot.id} box={snapshot} markdown />
      ))}
    </div>
  );
}

export function Transactions() {
  const [open, setOpen] = useState(false);
  return (
    <Section
      id="transactions"
      title="Transactions"
      note="The status box of a step of a run: the console's own component, drawn from the data a run produces. Blue while it is going on, green once confirmed, pink when it failed, grey when it was stopped."
    >
      <Both>
        <Example label="pending: waiting for the wallet, declined, paused">
          <Boxes boxes={[PENDING, DECLINED, PAUSED]} />
        </Example>
        <Example label="executed, with its link and its history">
          <Boxes boxes={[EXECUTED]} />
        </Example>
        <Example label="failed">
          <Boxes boxes={[FAILED]} />
        </Example>
        <Example label="stopped before its outcome was known; simulated">
          <Boxes boxes={[UNKNOWN, SIMULATED]} />
        </Example>
        <Example label="TWAP: before its first segment">
          <Boxes boxes={[TWAP_WAITING]} />
        </Example>
        <Example label="TWAP: a segment open, one executed">
          <Boxes boxes={[TWAP_RUNNING]} />
        </Example>
        <Example label="TWAP: a segment expired without executing">
          <Boxes boxes={[TWAP_MISSED]} />
        </Example>
        <Example label="TWAP: finished, cancelled">
          <Boxes boxes={[TWAP_DONE, TWAP_CANCELLED]} />
        </Example>
        <Example label="what a run printed: plain lines, a transaction, an expectation that passed and one that failed, a wait, an error">
          <div className="w-full">
            <Card aria-label="Simulation, failed" tone="danger">
              <Card.Header
                title="Simulation"
                status={<Badge tone="danger">failed</Badge>}
                time={
                  <Time at={NOW_MS - 240_000} now={NOW_MS} format="clock" />
                }
              />
              <div className="border-t-2 border-line">
                <Console
                  entries={OUTPUT}
                  errors={["ExpectError: expected 620.5 to equal 600"]}
                />
              </div>
            </Card>
          </div>
        </Example>
        <Example label="inside a run: folded, the latest line beside Stop opens it">
          <div className="w-full">
            <Card aria-label="Run, running" open={open} onOpenChange={setOpen}>
              <Card.Header
                title="Run"
                status={
                  <Badge tone="success" dot>
                    running
                  </Badge>
                }
                time={<Time at={NOW_MS - 60_000} now={NOW_MS} format="clock" />}
              />
              <Card.Body>
                <Boxes boxes={[EXECUTED, PENDING]} />
              </Card.Body>
              <Card.Footer summary={`${PENDING.title}: ${PENDING.detail}`}>
                <Button variant="neutral" size="sm">
                  Stop
                </Button>
              </Card.Footer>
            </Card>
          </div>
        </Example>
        <Example label="a run that only follows a TWAP">
          <div className="w-full">
            <Card aria-label="Run, watching" open onOpenChange={() => {}}>
              <Card.Header
                title="Run"
                status={
                  <Badge tone="info" dot>
                    watching
                  </Badge>
                }
                time={
                  <Time at={NOW_MS - 1_500_000} now={NOW_MS} format="clock" />
                }
              />
              <Card.Body>
                <Boxes boxes={[TWAP_RUNNING]} />
              </Card.Body>
              <Card.Footer summary={TWAP_RUNNING.detail}>
                <Button variant="neutral" size="sm">
                  Stop following
                </Button>
              </Card.Footer>
            </Card>
          </div>
        </Example>
      </Both>
    </Section>
  );
}
