import { useShiki } from "@repo/ui";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useScriptAnalysis } from "../../hooks/useScriptAnalysis";
import { useViewMode } from "../../hooks/useViewMode";
import { useTerminalStore } from "../../stores/terminal-store";
import { DiagnosticsChip } from "./DiagnosticsChip";
import { HoverPopover } from "./HoverPopover";
import { evmlTwoslashTransformer } from "./twoslashTransformer";

const TRANSFORMERS = [evmlTwoslashTransformer()];

/**
 * Mobile-friendly, Monaco-free read view of the active script. Uses Shiki
 * (≈30 KB) for syntax highlighting, mirrors the editor's executing-line
 * indicator, and offers the same hover popovers (addresses, helpers,
 * variables) the editor exposes — without bringing the editor along.
 */
export function ScriptViewer() {
  const script = useTerminalStore((s) => s.script);
  const executingLine = useTerminalStore((s) => s.executingLine);

  const highlighter = useShiki();
  const containerRef = useRef<HTMLDivElement>(null);

  const { diagnostics, getHoverInfo } = useScriptAnalysis(script);
  const { setViewMode } = useViewMode();

  // Tapping anywhere on the rendered script (other than a hover token, or
  // while the user is in the middle of a text-selection gesture) flips
  // into the editor — the same effect as the toolbar's Edit button. This
  // makes it cheap to reach for a quick tweak without hunting for a small
  // icon, especially on mobile.
  const handleViewerClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".evml-hover-target")) return;

      // Preserve text-selection gestures: if the user just dragged to
      // highlight a slice of the script (to copy / inspect), the
      // resulting click shouldn't yank them into the editor.
      const selection =
        typeof window !== "undefined" ? window.getSelection() : null;
      if (
        selection &&
        !selection.isCollapsed &&
        selection.toString().length > 0
      ) {
        return;
      }

      setViewMode("edit");
    },
    [setViewMode],
  );

  const html = useMemo(() => {
    if (!highlighter) return null;
    try {
      return highlighter.codeToHtml(script, {
        lang: "evml",
        theme: "evml-dark",
        transformers: TRANSFORMERS,
        // Required by `evmlTwoslashTransformer` to identify hover-target
        // spans by their grammar scope. `scopeName` is significantly
        // lighter than the full explanation payload.
        includeExplanation: "scopeName",
      });
    } catch {
      return null;
    }
  }, [highlighter, script]);

  // Apply / clear the executing-line highlight + autoscroll. Mirrors what
  // TerminalEditor does via `decorationsRef` + `revealLineInCenter`. The
  // `html` dep is intentional — when Shiki re-renders the script, the
  // previous `.line` nodes are gone and we need to re-add the class.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    root
      .querySelectorAll(".executing-line-highlight")
      .forEach((el) => el.classList.remove("executing-line-highlight"));

    if (executingLine == null) return;

    const lineEls = root.querySelectorAll<HTMLElement>("code .line");
    const lineEl = lineEls[executingLine - 1];
    if (!lineEl) return;

    lineEl.classList.add("executing-line-highlight");
    lineEl.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [executingLine, html]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <DiagnosticsChip diagnostics={diagnostics} />

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto evml-viewer"
        onClick={handleViewerClick}
      >
        {html ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki produces trusted HTML from a known grammar / theme
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="px-4 py-2 m-0 whitespace-pre-wrap break-words text-foreground/80">
            {script}
          </pre>
        )}
      </div>

      <HoverPopover containerRef={containerRef} getHoverInfo={getHoverInfo} />
    </div>
  );
}

export default ScriptViewer;
