import type { HoverInfo } from "@evmcrispr/core";
import { Popover } from "@repo/ui";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../panel/MarkdownComponents";

type Position = { line: number; col: number };

type HoverPopoverProps = {
  /** Container hosting the highlighted script — pointer / click events are
   *  attached at this level so a single popover can serve every token. */
  containerRef: RefObject<HTMLElement | null>;
  /** Memoised hover lookup from `useScriptAnalysis`. */
  getHoverInfo: (position: Position) => Promise<HoverInfo | null>;
};

/**
 * Build a `Measurable` virtual reference whose bounding rect always
 * matches the currently active token. Re-reads the rect on each Popper
 * positioning pass so the popover stays anchored when the user scrolls.
 */
function useTokenAnchor(): {
  virtualRef: RefObject<{ getBoundingClientRect: () => DOMRect }>;
  setActive: (el: HTMLElement | null) => void;
  active: HTMLElement | null;
} {
  const activeRef = useRef<HTMLElement | null>(null);
  const [active, setActiveState] = useState<HTMLElement | null>(null);

  const virtualRef = useRef({
    getBoundingClientRect: (): DOMRect => {
      const el = activeRef.current;
      if (!el) return new DOMRect(0, 0, 0, 0);
      return el.getBoundingClientRect();
    },
  });

  const setActive = useCallback((el: HTMLElement | null) => {
    activeRef.current = el;
    setActiveState(el);
  }, []);

  return { virtualRef, setActive, active };
}

function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
}

function parseTarget(
  el: HTMLElement | null,
): { target: HTMLElement; position: Position } | null {
  if (!el) return null;
  const target = el.closest<HTMLElement>(".evml-hover-target");
  if (!target) return null;
  const line = Number(target.dataset.hoverLine);
  const col = Number(target.dataset.hoverCol);
  if (!Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { target, position: { line, col } };
}

/**
 * Single popover that follows whichever hover-target span is currently
 * being interacted with. Hover-driven on devices that support hover,
 * tap-driven on touch. Renders the multi-card `HoverInfo` markdown the
 * same way Monaco does (one section per `contents[]` entry, separated by
 * a divider).
 */
const CLOSE_DELAY_MS = 120;

export function HoverPopover({
  containerRef,
  getHoverInfo,
}: HoverPopoverProps) {
  const { virtualRef, setActive, active } = useTokenAnchor();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<HoverInfo | null>(null);
  const requestIdRef = useRef(0);
  const touchPrimaryRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    touchPrimaryRef.current = isTouchPrimary();
    const mq = window.matchMedia("(hover: none)");
    const update = () => {
      touchPrimaryRef.current = mq.matches;
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  // Resolve hover info whenever the active target changes
  useEffect(() => {
    if (!active) {
      setInfo(null);
      return;
    }
    const line = Number(active.dataset.hoverLine);
    const col = Number(active.dataset.hoverCol);
    if (!Number.isFinite(line) || !Number.isFinite(col)) return;

    const id = ++requestIdRef.current;
    setInfo(null);
    getHoverInfo({ line, col })
      .then((result) => {
        if (id !== requestIdRef.current) return;
        // Empty results can happen when the transformer marks a span
        // the hover layer doesn't recognise (e.g. a command from a
        // module that hasn't been loaded yet, or while prewarm is
        // still in flight on a slow RPC). Quietly close instead of
        // flashing the empty state — the spinner stays up until Radix
        // finishes the exit transition.
        if (!result || result.contents.length === 0) {
          setOpen(false);
          return;
        }
        setInfo(result);
      })
      .catch(() => {
        if (id !== requestIdRef.current) return;
        // Same reasoning as the empty-result case: don't show an error
        // affordance on hover, just close.
        setOpen(false);
      });
  }, [active, getHoverInfo]);

  // Container-level event delegation — one set of listeners covers every
  // hoverable token regardless of how many there are.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const openAt = (target: HTMLElement, position: Position) => {
      cancelClose();
      setActive(target);
      setOpen(true);
      void position;
    };

    const handlePointerOver = (e: PointerEvent) => {
      if (touchPrimaryRef.current) return;
      const hit = parseTarget(e.target as HTMLElement | null);
      if (!hit) return;
      openAt(hit.target, hit.position);
    };

    const handlePointerOut = (e: PointerEvent) => {
      if (touchPrimaryRef.current) return;
      const hit = parseTarget(e.target as HTMLElement | null);
      if (!hit) return;
      const related = e.relatedTarget as Node | null;
      if (related && hit.target.contains(related)) return;
      // Defer the close so the user can move into the popover content
      // (which is portaled and therefore not a descendant of the target).
      scheduleClose();
    };

    const handleClick = (e: MouseEvent) => {
      const hit = parseTarget(e.target as HTMLElement | null);
      if (!hit) return;
      // On touch the click is the primary trigger; on hover devices it
      // also pins the popover so it survives mouse-out for inspection.
      e.preventDefault();
      openAt(hit.target, hit.position);
    };

    root.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("pointerout", handlePointerOut);
    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerout", handlePointerOut);
      root.removeEventListener("click", handleClick);
    };
  }, [containerRef, setActive, cancelClose, scheduleClose]);

  const sections = useMemo(() => info?.contents ?? [], [info]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Anchor virtualRef={virtualRef} />
      <Popover.Content
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        updatePositionStrategy="always"
        className="evml-hover-popover w-[min(92vw,360px)] max-h-[60vh] overflow-y-auto p-3 text-sm"
        onOpenAutoFocus={(e) => {
          // Don't steal focus on hover-open
          e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
        onPointerEnter={() => {
          if (!touchPrimaryRef.current) {
            cancelClose();
            setOpen(true);
          }
        }}
        onPointerLeave={() => {
          if (!touchPrimaryRef.current) scheduleClose();
        }}
      >
        {sections.length === 0 ? (
          // Either still resolving, or the result was empty and we're
          // about to close. Either way, never flash an empty-state
          // message — the spinner is the only acceptable transient UI.
          <div className="flex items-center gap-2 text-foreground/60">
            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            Resolving…
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-li:text-foreground/80 prose-hr:border-foreground/20 prose-a:text-evm-green-300 prose-p:my-1 prose-ul:my-1">
            {sections.map((md, i) => (
              <div key={i}>
                {i > 0 && <hr className="my-2 border-foreground/20" />}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {md}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        )}
      </Popover.Content>
    </Popover>
  );
}
