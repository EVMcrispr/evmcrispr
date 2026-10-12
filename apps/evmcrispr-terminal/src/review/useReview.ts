import { useEvmlTag } from "@evmcrispr/editor";
import type { Action } from "@evmcrispr/sdk";
import { isReviewed } from "@evmcrispr/space";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import { useMarkers, useScript, useSpace } from "../app/SpaceContext";
import { useScriptInput } from "../hooks/useScriptInput";
import { useWallet } from "../wallet/WalletContext";
import type { Changes } from "./changes";
import { ARM_MS, askForReview, useSurface } from "./surface";

export interface Diagnostic {
  line: number;
  col: number;
  severity: string;
  message: string;
}

/** What the script would do, as far as it has been asked. */
export type Simulation =
  | {
      status: "idle" | "validating" | "valid" | "simulating";
      diagnostics: Diagnostic[];
    }
  | { status: "ready"; diagnostics: Diagnostic[]; actions: Action[] }
  | {
      status: "error";
      diagnostics: Diagnostic[];
      message: string;
      actions: Action[];
    };

/**
 * What is known of the script on screen for its review: whether it is
 * reviewed, and what it would do. Everything in it is about one text,
 * `text`, the script as this render has it: the simulation (which is dropped the moment the script, the account or the
 * stdin is another), and what a run started from here is bound to. It
 * follows the script; what the user is asked to approve does not (see
 * `useApproval`).
 */
export interface Review {
  /** The script as this render has it. */
  text: string;
  /** It is not the text the user approved. Read from the approved text
   *  alone, never from a diff. */
  unreviewed: boolean;
  simulation: Simulation;
  /** External modules the check did not fetch, so did not check: for an
   *  unreviewed script it asks nobody for anything the script names. */
  unfetched: string[];
  /** Checks the script without running it. Of an unreviewed script it
   *  only reads the text: the modules it loads from elsewhere are not
   *  fetched. */
  validate(): Promise<void>;
  /** Checks the script and runs it as a simulated run of the space, which
   *  appears in the timeline like any other. Information only: approving
   *  never depends on it. */
  simulate(): Promise<void>;
  /** The simulation passed for the script as it is, and it is reviewed. */
  canExecute: boolean;
}

const IDLE: Simulation = { status: "idle", diagnostics: [] };

export function useReview(): Review {
  const { runs } = useApp();
  const space = useSpace();
  const tag = useEvmlTag();
  const { text } = useScript();
  const { approvedText } = useMarkers();
  const { address } = useWallet();
  const stdin = useScriptInput(space.id).input?.text;
  const unreviewed = !isReviewed(text, approvedText);

  // A result belongs to what it was asked of. Anything else on screen
  // (another text, another account, another stdin) reads as not asked.
  const of = JSON.stringify([space.id, text, address ?? null, stdin ?? null]);
  const [result, setResult] = useState({
    of,
    simulation: IDLE,
    unfetched: [] as string[],
  });
  const simulation = result.of === of ? result.simulation : IDLE;
  const unfetched = result.of === of ? result.unfetched : [];
  // Of two requests the later one reports; none reports once unmounted.
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );

  const check = async () => {
    const request = ++latest.current;
    let left: string[] = [];
    const set = (next: Simulation) => {
      if (request === latest.current)
        setResult({ of, simulation: next, unfetched: left });
      return request === latest.current;
    };
    set({ status: "validating", diagnostics: [] });
    // Reading a text nobody approved must not send a request to an
    // address that text chose: its external modules are left unfetched.
    // Asked of the space now, for the very text being checked.
    const checked = await tag.script(text).validate({
      remoteModules: isReviewed(text, space.markers.getState().approvedText),
    });
    left = checked.unfetched ?? [];
    const diagnostics = checked.diagnostics.map(
      ({ line, col, severity, message }) => ({ line, col, severity, message }),
    );
    const valid = checked.valid
      ? set({ status: "valid", diagnostics })
      : !set({
          status: "error",
          diagnostics,
          message: "Fix the validation errors before simulating.",
          actions: [],
        });
    return valid ? { set, diagnostics } : null;
  };

  return {
    text,
    unreviewed,
    simulation,
    unfetched,
    canExecute: simulation.status === "ready" && !unreviewed,
    async validate() {
      await check();
    },
    async simulate() {
      const checked = await check();
      if (!checked) return;
      const { set, diagnostics } = checked;
      set({ status: "simulating", diagnostics });
      const fail = (message: string, actions: Action[] = []) =>
        void set({ status: "error", diagnostics, message, actions });
      // Bound to the text this render shows: a script that changed since
      // is not simulated under this review's name.
      const started = await runs.start(space.id, {
        mode: "simulated",
        stdin,
        text,
      });
      if (!started.ok)
        return fail(
          started.reason === "changed"
            ? "The script changed. Simulate it again."
            : "This space is no longer here.",
        );
      await started.ended;
      const run = runs.store.getState()[started.runId];
      if (!run?.simulated)
        return fail(run?.record.errors[0] ?? "The simulation failed.");
      const { success, actions, error } = run.simulated;
      if (!success)
        return fail(error ?? "The fork simulation failed.", actions);
      set({ status: "ready", diagnostics, actions });
    },
  };
}

/**
 * What the review has put in front of the user, and the question it asks:
 * "approve this?". A review is of a snapshot: the changes as they were
 * when the user asked to see them (`surface.ts`). It does not follow the
 * script. When the script becomes another text meanwhile (the assistant,
 * another tab), the snapshot stays on screen, it is `stale`, and nothing
 * can be approved until the user asks to be shown the changes as they are
 * now. Approve hands over the snapshot's text, and the space refuses it
 * if it is no longer the script.
 *
 * Every unknown ends on "not approved": nothing asked for, another space's
 * snapshot, a snapshot that has not been on screen long enough, a script
 * that moved on, an error while approving.
 */
export interface Approval {
  /** The changes the user asked to see, as they were then. Null when
   *  they have not asked (the review came up by itself, or is closed). */
  shown: Changes | null;
  /** The script is no longer the text of `shown`. */
  stale: boolean;
  /** `shown` has been on screen long enough for Approve to take a click. */
  armed: boolean;
  /** The user asks for the changes as they are now. Only ever called
   *  from the handler of something the user just did. */
  ask(): void;
  /** Approves the text shown, and only that one. False when nothing was
   *  approved, whatever the reason. */
  approve(): boolean;
}

export function useApproval(): Approval {
  const space = useSpace();
  const { text } = useScript();
  const surface = useSurface();
  const shown =
    surface.open && surface.spaceId === space.id ? surface.shown : null;
  const { shownAt } = surface;
  const stale = shown !== null && shown.text !== text;
  // The button follows the clock; `approve` asks the clock itself.
  const [armedFor, setArmedFor] = useState<Changes | null>(null);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(
      () => setArmedFor(shown),
      Math.max(0, ARM_MS - (performance.now() - shownAt)),
    );
    return () => clearTimeout(timer);
  }, [shown, shownAt]);
  return {
    shown,
    stale,
    armed: shown !== null && armedFor === shown && !stale,
    ask: () => askForReview(space),
    approve() {
      if (!shown || stale) return false;
      if (performance.now() - shownAt < ARM_MS) return false;
      try {
        // The space compares with the document itself, not with what
        // this render knows of it.
        return space.approve(shown.text) === true;
      } catch {
        return false;
      }
    },
  };
}
