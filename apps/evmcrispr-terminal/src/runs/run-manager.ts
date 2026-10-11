// Runs belong to their space and outlive the view: this file owns every
// run of this tab, outside React. Three rules it keeps, each in one place:
//  - What reaches the wallet goes through the run's gate (`gate.ts`), which
//    holds it while the run's space is not the one on screen and after a
//    refusal. Nothing else decides that.
//  - What runs is the text of the space on screen when Execute was pressed.
//    Timeline entries and run records can arrive from other copies; they
//    are shown, and never decide what is executed or signed.
//  - What must happen once is asked of the locks: one real run per space,
//    and "is anyone still running this run" for the interrupted rule.
//    Without Web Locks a tab believes it is alone: it cannot be refused
//    for a run going on in another tab, and takes that run for interrupted
//    until the other tab writes its record again.
import {
  type ActionHandlerCtx,
  type ActionHandlers,
  classifyError,
} from "@evmcrispr/core";
import type {
  WorkerEvml,
  WorkerEvmlClientConfig,
} from "@evmcrispr/core/worker-client";
import {
  type ConsoleEvent,
  type ConsoleState,
  emptyConsole,
  reduceConsole,
} from "@evmcrispr/editor";
import type { Action } from "@evmcrispr/sdk";
import {
  type Author,
  head,
  isReviewed,
  type RunRecord,
  type RunStatus,
  UNFINISHED,
} from "@evmcrispr/space";
import type { WalletClient } from "viem";
import { createStore, type StoreApi } from "zustand/vanilla";
import { browserSafeUrl } from "../config/browserSafeUrl";
import type { LiveSpace } from "../space/live-space";
import type { Spaces } from "../space/spaces";
import type { Changes } from "../storage/changes";
import { type Locks, lockNames, type Release } from "../storage/locks";
import type { Records } from "../storage/records";
import { normaliseAction } from "./action-summary";
import { appendOutput, boundErrors } from "./bounds";
import { createGate, type Gate, type Held } from "./gate";
import { makeSafeBatchedHandler, reachesWallet } from "./handlers";
import { guardWallet, type WalletGuard } from "./wallet-guard";

export type RunPhase = "preparing" | "running" | "awaiting-wallet";
export type Run = RunRecord<ConsoleState>;

/** A run this tab is running, or ran while the page was open. */
export interface LiveRun {
  spaceId: string;
  record: Run;
  /** 1-based line being executed, while the script runs. */
  line: number | null;
  phase: RunPhase | null;
  held: Held<Action> | null;
  /** What a real run sent, once it ended. */
  executed: { action: Action; result?: unknown }[];
  /** What a simulated run resolved. */
  simulated?: {
    success: boolean;
    actions: Action[];
    logs: string[];
    error?: string;
  };
}

type Refusal =
  | "missing"
  | "off-screen"
  | "busy"
  | "elsewhere"
  /** The script is not the text the user approved: a real run waits for
   *  the review. */
  | "unreviewed"
  /** The script is no longer the text the caller showed. */
  | "changed";

export interface StartOptions {
  mode: "real" | "simulated";
  stdin?: string;
  /** The text the caller has on display. The run is refused ("changed")
   *  unless that is the script, so what was shown is what runs. */
  text?: string;
}
export type StartResult =
  | { ok: true; runId: string; ended: Promise<RunStatus> }
  | { ok: false; reason: Refusal };

export interface Wallet {
  client: WalletClient | undefined;
  address: `0x${string}` | undefined;
  /** The Safe connector, when the app runs as a Safe app. */
  safe?: unknown;
}

export interface RunManager {
  /** Runs of this tab, by run id. Written only by the manager. */
  readonly store: StoreApi<Record<string, LiveRun>>;
  /** Starts a run of the space's script as it is now. A real run needs the
   *  space on screen, nobody else running it, and the script reviewed: it
   *  is the one way a real run starts, so the review cannot be gone
   *  around. A simulated run is never refused for any of the three. */
  start(spaceId: string, options: StartOptions): Promise<StartResult>;
  /** Passes a paused run's held action to the wallet. Only ever called
   *  from something the user just did. */
  resume(runId: string): void;
  /** Ends the run. Nothing of it reaches the wallet afterwards. */
  cancel(runId: string): void;
  /** Marks as interrupted the runs of `space` that nobody is running, now
   *  and when whoever runs one goes away. */
  adopt(space: LiveSpace): Promise<void>;
}

export interface RunDeps {
  spaces: Spaces;
  locks: Locks;
  records: Records;
  changes: Changes;
  now(): number;
  me(): Author;
  createWorker(): WorkerEvml;
  wallet(): Promise<Wallet>;
  /** How long a cancelled run may take to stop before it is ended anyway
   *  (default 3 s: past the worker's own kill grace). */
  cancelGraceMs?: number;
}

const FLUSH_EVERY = 2_000;
const CANCEL_GRACE = 3_000;
const CANCELLED_MESSAGES = new Set([
  "Execution cancelled",
  "Observation cancelled",
]);

export const isUnfinished = (run: { status: RunStatus }) =>
  UNFINISHED.includes(run.status);

/** Live boxes that hold a run open after its script ended. Simulated ones
 *  never do. */
export const followedBoxes = (console: ConsoleState): number =>
  Object.values(console.boxes).filter(
    (box) => box.state === "live" && !box.simulated,
  ).length;

const switchTo = (chainId: number): Action => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId: `0x${chainId.toString(16)}` }],
});

export function createRunManager(deps: RunDeps): RunManager {
  const { spaces, locks, records, changes, now, me } = deps;
  const store = createStore<Record<string, LiveRun>>(() => ({}));
  /** What only the manager needs to drive a run it started. */
  const controls = new Map<
    string,
    { spaceId: string; resume(): void; cancel(): void }
  >();

  const update = (runId: string, change: (run: LiveRun) => LiveRun) =>
    store.setState((runs) =>
      runs[runId] ? { ...runs, [runId]: change(runs[runId]) } : runs,
    );
  /** Spaces whose real run is being set up: between the checks and the
   *  run being in the store, a second start is refused on this. */
  const starting = new Set<string>();
  const mine = (spaceId: string) =>
    Object.values(store.getState()).filter(
      (run) =>
        run.spaceId === spaceId &&
        run.record.mode === "real" &&
        isUnfinished(run.record),
    );

  /** The mark the list of spaces shows without opening the space. */
  const mark = (spaceId: string) => {
    const statuses = mine(spaceId).map((run) => run.record.status);
    const run = (["paused", "running", "watching"] as const).find((status) =>
      statuses.includes(status),
    );
    void records
      .patchSpace(spaceId, { run })
      .then(() => changes.announce({ store: "spaces", key: spaceId }));
  };

  async function start(
    spaceId: string,
    options: StartOptions,
  ): Promise<StartResult> {
    const real = options.mode === "real";
    const space = await spaces.acquire(spaceId).catch(() => null);
    if (!space) return { ok: false, reason: "missing" };

    // Everything that decides whether this run may start, and the text it
    // will run, is settled here in one go, with nothing awaited in
    // between: what is checked is what runs. The review is asked of
    // `text` itself, the very string handed to the interpreter below, and
    // of the approved text alone: no entry, record or author is consulted.
    const text = space.getText();
    const allowed = (): Refusal | null =>
      !real
        ? null
        : spaces.onScreen.getState() !== spaceId
          ? "off-screen"
          : mine(spaceId).length
            ? "busy"
            : null;
    const refusal: Refusal | null =
      allowed() ??
      (real && starting.has(spaceId) ? "busy" : null) ??
      (options.text !== undefined && options.text !== text
        ? "changed"
        : null) ??
      (real && !isReviewed(text, space.markers.getState().approvedText)
        ? "unreviewed"
        : null);
    if (refusal) {
      spaces.release(spaceId);
      return { ok: false, reason: refusal };
    }
    // A run starts: typing not yet recorded becomes a revision. It is
    // where the card finds the text again, and only that: the run executes
    // `text`, whatever the timeline holds.
    const recorded = space.record("user") ?? head(space.timeline.getState());
    const revisionId = recorded?.text === text ? recorded.id : "";
    if (real) starting.add(spaceId);

    // The locks take time to be granted. What can have changed meanwhile
    // is asked again; the text cannot, it was taken above.
    const held: Release[] = [];
    const refuse = (reason: Refusal): StartResult => {
      for (const release of held) release();
      if (real) starting.delete(spaceId);
      spaces.release(spaceId);
      return { ok: false, reason };
    };
    const runId = crypto.randomUUID();
    let spaceLock: Release | undefined;
    try {
      if (real) {
        const lock = await locks.tryHold(lockNames.run(spaceId));
        if (!lock) return refuse("elsewhere");
        held.push((spaceLock = lock));
      }
      held.push(await locks.hold(lockNames.running(runId)));
    } catch {
      return refuse("missing");
    }
    const alive = held.at(-1) as Release;
    const still = allowed();
    if (still) return refuse(still);
    if (!spaces.index.getState().some((meta) => meta.id === spaceId))
      return refuse("missing");
    if (real) starting.delete(spaceId);

    const evml = deps.createWorker();
    const abort = new AbortController();
    const startedAt = now();
    const by = me();

    /** The run has ended: whatever of it is still unwinding writes nothing. */
    let over = false;
    let written = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Commits the record: memory, storage and the other tabs. */
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (over) return;
      // Of two copies of a record the later one wins, and this tab is the
      // one running it: its copy is always the later one, whatever time a
      // copy from elsewhere claims.
      const theirs = space.timeline.getState().runs.get(runId)?.updatedAt ?? 0;
      written = Math.max(now(), written + 1, theirs + 1);
      update(runId, (r) => ({
        ...r,
        record: { ...r.record, updatedAt: written },
      }));
      space.commit({ runs: [store.getState()[runId].record] });
    };
    /** The console changed: write soon, not now. */
    const touch = () => {
      timer ??= setTimeout(flush, FLUSH_EVERY);
    };
    const setStatus = (status: RunStatus, patch: Partial<Run> = {}) => {
      update(runId, (r) => ({
        ...r,
        record: { ...r.record, ...patch, status },
      }));
      // Status changes are written at once and shown in the list.
      flush();
      if (real) mark(spaceId);
    };
    const feed = (event: ConsoleEvent) => {
      update(runId, (r) => ({
        ...r,
        record: {
          ...r.record,
          console: reduceConsole(r.record.console, event),
        },
      }));
      touch();
    };

    let cancelled = false;
    /** The script had ended when Cancel came: only following stopped. */
    let stoppedFollowing = false;
    // The run's wallet, once known, and the pass under way: the wallet
    // tells that pass when a request of it was granted.
    let guard: WalletGuard | undefined;
    let sent: (() => void) | undefined;
    const gate: Gate<Action> = createGate<Action>({
      onScreen: () => spaces.onScreen.getState() === spaceId,
      // Only what the wallet itself answered to a request. An error that
      // carries the same code from anywhere else ends the run.
      isRefusal: (error) => guard?.isRefusal(error) ?? false,
      isHeldBack: (error) => guard?.isHeldBack(error) ?? false,
      now,
      onChange: (held) => {
        if (over) return;
        update(runId, (r) => ({ ...r, held }));
        if (held) setStatus("paused", { pausedBy: held.reason });
        else if (!cancelled) setStatus("running", { pausedBy: undefined });
      },
    });
    controls.set(runId, {
      spaceId,
      resume: () => gate.resume(),
      cancel() {
        if (cancelled) return;
        cancelled = true;
        stoppedFollowing = store.getState()[runId].record.status === "watching";
        const refused = gate.held()?.reason === "declined";
        // The gate closes first: from here nothing reaches the wallet.
        gate.cancel();
        // After a refusal the script is told of it before the run is
        // aborted, so the step's box reads as rejected, not as cancelled.
        if (refused) setTimeout(() => abort.abort(), 0);
        else abort.abort();
      },
    });

    store.setState((runs) => ({
      ...runs,
      [runId]: {
        spaceId,
        line: null,
        phase: "preparing",
        held: null,
        executed: [],
        record: {
          id: runId,
          revisionId,
          mode: options.mode,
          status: "running",
          startedAt,
          by,
          console: emptyConsole,
          errors: [],
          output: "",
          executedCount: 0,
          updatedAt: startedAt,
        },
      },
    }));
    space.commit({
      entries: [{ kind: "run", id: runId, runId, ts: startedAt, author: by }],
    });
    flush();
    if (real) mark(spaceId);

    /** The page's side of the run: everything the worker reports. */
    const listeners: WorkerEvmlClientConfig = {
      stdin: options.stdin,
      onLog: (text, _prev, meta) =>
        feed({ kind: "line", text, box: meta?.box }),
      onBox: (snapshot) => feed({ kind: "box", snapshot }),
      onOutput: (text) => {
        feed({ kind: "line", text });
        update(runId, (r) => ({
          ...r,
          record: {
            ...r.record,
            output: appendOutput(r.record.output, text),
          },
        }));
      },
      onLine: (line) => {
        update(runId, (r) => ({
          ...r,
          line,
          phase:
            line === null
              ? null
              : r.phase === "preparing"
                ? "running"
                : r.phase,
        }));
        // The script ended but boxes it opened are still followed: the
        // run stays open, and needs no signature any more.
        const { record } = store.getState()[runId];
        if (line === null && real && followedBoxes(record.console) > 0)
          setStatus("watching");
      },
    };

    const finish = (status: RunStatus, errors: string[] = []) => {
      controls.delete(runId);
      // Whatever handler is still under way finds the gate closed: a run
      // that has ended asks the wallet for nothing more.
      gate.cancel();
      if (status !== "success")
        feed({
          kind: "end-live",
          detail:
            status === "cancelled"
              ? "Stopped following"
              : "Stopped following: the script stopped unexpectedly",
        });
      update(runId, (r) => ({ ...r, line: null, phase: null, held: null }));
      setStatus(status, {
        errors: boundErrors(errors),
        endedAt: now(),
        pausedBy: undefined,
      });
      over = true;
      evml.terminate();
      alive();
      spaceLock?.();
      spaces.release(spaceId);
      return status;
    };

    const execute = async (wallet: Wallet) => {
      guard =
        wallet.client &&
        guardWallet(wallet.client, {
          submitted: () => sent?.(),
          allows: () => gate.allows(),
        });
      // A change of phase is written at once, like a change of status.
      const phase = (value: RunPhase) => {
        if (over) return;
        update(runId, (r) => ({ ...r, phase: value }));
        flush();
      };
      /** A handler whose action goes through the gate. */
      const gated =
        <A extends Action>(
          send: (action: A, ctx: ActionHandlerCtx) => Promise<unknown>,
        ) =>
        (action: A, ctx: ActionHandlerCtx) =>
          gate.pass(
            action,
            // Nothing is awaited between the gate's check and the send.
            async (reportSent) => {
              sent = reportSent;
              phase("awaiting-wallet");
              try {
                return await send(action, ctx);
              } finally {
                sent = undefined;
                phase("running");
              }
            },
            (state) => ctx.onStatus?.(state),
          );
      const pass = (action: Action, ctx: ActionHandlerCtx) => ctx.next(action);
      // Every kind of action the core knows, so a kind added there does
      // not compile until it is placed here. Each goes through the gate
      // unless it never asks the wallet for anything; and should one of
      // those ask after all, the wallet guard refuses the request.
      const handlers: ActionHandlers = {
        // A wallet request is sent in the form it is described in: what
        // the held action shows is the very value the wallet receives.
        wallet: (action, ctx) => gated(pass)(normaliseAction(action), ctx),
        // Endpoints a module asks to submit through are declared as the
        // module sees them; the browser can only use https.
        transaction: (action, ctx) => {
          const routed = action.rpcUrl
            ? { ...action, rpcUrl: browserSafeUrl(action.rpcUrl) }
            : action;
          return reachesWallet(action)
            ? gated(pass)(routed, ctx)
            : ctx.next(routed);
        },
        batched: gated(
          wallet.safe
            ? makeSafeBatchedHandler(wallet.safe, () => gate.allows())
            : pass,
        ),
        smartBatch: gated(
          wallet.safe
            ? async () => {
                throw new Error(
                  "The Safe Apps SDK cannot submit this smart-batch route. Connect an owner wallet and use safe:propose <safe> !(...) or safe:execute <safe> !(...).",
                );
              }
            : pass,
        ),
        rpc: pass,
        terminal: pass,
      };
      return evml
        .with({ account: wallet.address, ...listeners })
        .script(text)
        .execute(guard?.client, {
          signal: abort.signal,
          handlers,
          // The change of chain asked before the script starts is a wallet
          // request like any other: held off screen, and after a refusal.
          prepareChain: (chainId, align) =>
            gate.pass(
              switchTo(chainId),
              async (reportSent) => {
                sent = reportSent;
                try {
                  return await align();
                } finally {
                  sent = undefined;
                }
              },
              () => {},
            ),
        });
    };

    // A cancelled run ends, whether or not what it was waiting for ever
    // answers: a wallet that never replies must not keep the space busy.
    const stopped = new Promise<never>((_, reject) =>
      abort.signal.addEventListener("abort", () =>
        setTimeout(
          () => reject(new Error("Execution cancelled")),
          deps.cancelGraceMs ?? CANCEL_GRACE,
        ),
      ),
    );
    stopped.catch(() => {});

    const ended = (async (): Promise<RunStatus> => {
      try {
        const wallet = await deps.wallet();
        if (!real) {
          const result = await Promise.race([
            evml
              .with(listeners)
              .script(text)
              .simulate({ from: wallet.address, signal: abort.signal }),
            stopped,
          ]);
          const { success, actions, logs, error } = result;
          update(runId, (r) => ({
            ...r,
            simulated: { success, actions, logs, error },
          }));
          if (cancelled) return finish("cancelled");
          return finish(success ? "success" : "error", error ? [error] : []);
        }
        const { executed } = await Promise.race([execute(wallet), stopped]);
        update(runId, (r) => ({
          ...r,
          executed,
          record: { ...r.record, executedCount: executed.length },
        }));
        // Cancel always ends the run, also when the script took the
        // refusal in its stride and came to its end.
        return finish(cancelled && !stoppedFollowing ? "cancelled" : "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Rejecting in the wallet is a choice, not a failure: the step's
        // box already says so, and no error text follows.
        if (classifyError(error).kind === "rejected")
          return finish("cancelled");
        if (cancelled || CANCELLED_MESSAGES.has(message))
          return finish("cancelled", ["Script execution cancelled"]);
        console.error(error);
        const hash = message.startsWith("transaction failed")
          ? message.split('"')[1]
          : undefined;
        return finish("error", [
          hash && /^0x[0-9a-f]{64}$/.test(hash)
            ? `Transaction failed, watch in block explorer ${hash}`
            : message,
        ]);
      }
    })();

    return { ok: true, runId, ended };
  }

  // A space that was removed, here or in another tab, takes its runs along.
  void spaces.ready.then(() =>
    spaces.index.subscribe((list) => {
      const listed = new Set(list.map((meta) => meta.id));
      for (const control of [...controls.values()])
        if (!listed.has(control.spaceId)) control.cancel();
    }),
  );

  /** Runs whose lock is being waited for, so each is waited for once. */
  const awaited = new Set<string>();

  /** Ends, as interrupted, the runs among `ids` that are still unfinished
   *  in `space`. Called only for runs nobody is running. */
  const interrupt = async (space: LiveSpace, ids: string[]) => {
    if (!ids.length) return;
    // Storage is asked, not this tab's copy: the runner writes the end of
    // its run before it lets go of the lock, and that news may not have
    // reached this tab yet.
    const stored = (await records.loadTimeline(space.id)).runs as Run[];
    const latest = stored.filter((record) => ids.includes(record.id));
    space.commit({ runs: latest });
    const stale = latest.flatMap((record): Run[] => {
      if (!isUnfinished(record)) return [];
      const at = Math.max(now(), record.updatedAt + 1);
      return [
        {
          ...record,
          status: "interrupted",
          pausedBy: undefined,
          endedAt: at,
          updatedAt: at,
          console: reduceConsole(record.console, {
            kind: "end-live",
            detail: "Stopped following: the page was closed",
          }),
        },
      ];
    });
    if (!stale.length) return;
    space.commit({ runs: stale });
    // The list's mark goes too, unless a run is going on in the space.
    if (await locks.isHeld(lockNames.run(space.id))) return;
    await records.patchSpace(space.id, { run: undefined });
    changes.announce({ store: "spaces", key: space.id });
  };

  // Whether anyone runs a run is asked by taking its lock: only its
  // runner ever holds it, so getting it means the runner is gone.
  async function adopt(space: LiveSpace): Promise<void> {
    const free: string[] = [];
    const all = space.timeline.getState().runs as ReadonlyMap<string, Run>;
    for (const record of all.values()) {
      if (!isUnfinished(record) || controls.has(record.id)) continue;
      const lock = lockNames.running(record.id);
      const release = await locks.tryHold(lock);
      if (release) {
        release();
        free.push(record.id);
      } else if (!awaited.has(record.id)) {
        // Someone is running it: it is interrupted when they have gone.
        awaited.add(record.id);
        void locks
          .hold(lock)
          .then((got) => {
            got();
            return interrupt(space, [record.id]);
          })
          .catch(() => {})
          .finally(() => awaited.delete(record.id));
      }
    }
    await interrupt(space, free);
  }

  return {
    store,
    start,
    resume: (runId) => controls.get(runId)?.resume(),
    cancel: (runId) => controls.get(runId)?.cancel(),
    adopt,
  };
}
