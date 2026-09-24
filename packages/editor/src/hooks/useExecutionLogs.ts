import type { BoxSnapshot } from "@evmcrispr/sdk";
import { useCallback, useMemo, useState } from "react";
import {
  consoleEntries,
  emptyConsole,
  reduceConsole,
} from "../console/entries";

export function useExecutionLogs() {
  const [state, setState] = useState(emptyConsole);

  /** `onLog` listener. Lines tagged with a known box id are shown by the box. */
  const logListener = useCallback(
    (log: string, _prev?: string[], meta?: { box?: string }) =>
      setState((s) =>
        reduceConsole(s, { kind: "line", text: log, box: meta?.box }),
      ),
    [],
  );

  /** `onBox` listener. */
  const boxListener = useCallback(
    (snapshot: BoxSnapshot) =>
      setState((s) => reduceConsole(s, { kind: "box", snapshot })),
    [],
  );

  /** Ends every box still live as cancelled with `detail`: for a run that
   *  died (its worker was killed or crashed) and sends no more snapshots. */
  const endLiveBoxes = useCallback(
    (detail: string) =>
      setState((s) => reduceConsole(s, { kind: "end-live", detail })),
    [],
  );

  const clearLogs = useCallback(() => setState(emptyConsole), []);

  const entries = useMemo(() => consoleEntries(state), [state]);
  /** Plain lines only (box-tagged lines whose box is shown are left out). */
  const logs = useMemo(
    () =>
      state.slots.flatMap((slot) => (slot.kind === "line" ? [slot.text] : [])),
    [state],
  );

  return {
    entries,
    logs,
    liveBoxes: state.live,
    logListener,
    boxListener,
    endLiveBoxes,
    clearLogs,
  };
}
