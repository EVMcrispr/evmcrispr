import { useShiki } from "@evmcrispr/editor";
import { ChevronRight, Code } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "../utils";

interface ScriptPageProps {
  title: ReactNode;
  /** The line under the title: when it changed, its marks. */
  meta?: ReactNode;
  /** The script's text. Its first lines are shown, as the editor
   *  colours them. */
  text: string;
  onClick?: () => void;
  /** As tall as it is given, with as many lines as fit, where it shares
   *  a view with something else. Left out, it is as tall as five lines. */
  fill?: boolean;
  /** A smaller head, for a frame that is a part of a view and is titled
   *  with what it is ("Script", "Timeline"), not with a name. */
  compact?: boolean;
  /** `false`: the head alone, with an arrow at its right: no lines of
   *  the script and no foot. For a view whose room goes to what stands
   *  beside the script. */
  preview?: boolean;
  /** Buttons that act on the script, before the arrow. Only where the
   *  head stands alone (`preview={false}`): they are not part of the
   *  button that opens it. */
  actions?: ReactNode;
  /** Names the page for a view transition: what carries the same name
   *  before or after the change becomes it, or comes from it. */
  transitionName?: string;
  /** Names the title alone for a view transition: it travels by itself
   *  to the title that carries the same name afterwards. */
  titleTransitionName?: string;
  className?: string;
}

const FRAME =
  "border-2 border-primary bg-surface-2 shadow-sm [--shadow-color:var(--success-line)]";

const HEAD = "flex items-center gap-2.5";

const NAME = "min-w-0 flex-1 truncate font-head font-bold text-heading";

/** The title's size: the name of a script, or the label of a part of a
 *  view (`compact`). */
const size = (compact: boolean) => (compact ? "text-title" : "text-display");

const META =
  "mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sans text-caption text-fg-faint";

const FOOT =
  "flex items-center gap-2 border-t-2 border-primary/40 bg-success-surface px-3.5 py-2 font-sans text-caption";

/** How many lines of the script the page shows. */
const LINES = 5;

/** How many it has ready where it is as tall as it is given: more than
 *  will fit, the rest cut off by its own edge. */
const MANY = 40;

interface Piece {
  content: string;
  color?: string;
}

/** Whether a line of the script is a comment. */
const comment = (line: Piece[]) =>
  line
    .map((piece) => piece.content)
    .join("")
    .trimStart()
    .startsWith("#");

/** The first lines of a script, coloured once the highlighter is here. */
function useLines(text: string, count: number): Piece[][] {
  const highlighter = useShiki();
  return useMemo(() => {
    if (!text.trim()) return [];
    const head = text.split("\n").slice(0, count);
    const plain = head.map((line) => [{ content: line }]);
    if (!highlighter) return plain;
    try {
      return highlighter.codeToTokensBase(head.join("\n"), {
        lang: "evml",
        theme: "evml-dark",
      });
    } catch {
      return plain;
    }
  }, [highlighter, text, count]);
}

/** A script, drawn as what it is: a page with its first lines on it. Leads a view of the things that happened to it,
 *  none of which look like this. */
export function ScriptPage({
  title,
  meta,
  text,
  onClick,
  fill = false,
  compact = false,
  preview = true,
  actions,
  transitionName,
  titleTransitionName,
  className,
}: ScriptPageProps) {
  const lines = useLines(text, fill ? MANY : LINES);
  const total = text.trim() ? text.trimEnd().split("\n").length : 0;

  const head = (
    <span className="block min-w-0 flex-1">
      <span className={HEAD}>
        <Code
          aria-hidden
          className={cn("shrink-0 text-success", compact ? "size-4" : "size-5")}
        />
        <span
          style={{ viewTransitionName: titleTransitionName }}
          className={cn(NAME, size(compact))}
        >
          {title}
        </span>
      </span>
      {meta && <span className={META}>{meta}</span>}
    </span>
  );

  // With buttons of its own the head is a row of siblings, as a `Row`
  // is: what opens the script, what acts on it, and the arrow, which
  // opens it too.
  if (!preview && actions)
    return (
      <div
        style={{ viewTransitionName: transitionName }}
        className={cn(
          FRAME,
          "group flex items-stretch transition-colors hover:bg-surface-hover",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center px-3.5 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "py-2" : "py-3",
          )}
        >
          {head}
        </button>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onClick}
          className="flex shrink-0 cursor-pointer items-center pr-3.5 pl-1.5"
        >
          <ChevronRight
            aria-hidden
            className="size-5 shrink-0 text-success transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </div>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ viewTransitionName: transitionName }}
      className={cn(
        FRAME,
        "group w-full cursor-pointer p-0 text-left outline-hidden transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
        fill ? "flex min-h-0 flex-col" : "block",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center gap-2 px-3.5",
          compact ? "py-2" : "py-3",
        )}
      >
        {head}
        {!preview && (
          <ChevronRight
            aria-hidden
            className="size-5 shrink-0 text-success transition-transform group-hover:translate-x-0.5"
          />
        )}
      </span>

      {preview && lines.length > 0 && (
        <span
          // The last line shown fades where the script goes on.
          style={
            fill
              ? {
                  maskImage:
                    "linear-gradient(to bottom, black calc(100% - 2.5rem), transparent)",
                }
              : total > lines.length
                ? {
                    maskImage:
                      "linear-gradient(to bottom, black 55%, transparent)",
                  }
                : undefined
          }
          className={cn(
            "block border-t-2 border-line bg-surface-well py-2.5 pr-3 font-mono text-caption leading-relaxed",
            fill && "min-h-0 flex-1 overflow-hidden",
          )}
        >
          {lines.map((line, index) => (
            <span key={index} className="flex gap-3">
              <span className="w-8 shrink-0 text-right text-fg-faint/60 select-none">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-pre text-fg-muted">
                {line.length === 0 && " "}
                {line.map((piece, at) => (
                  <span
                    key={at}
                    // A comment keeps to a colour that reads at this size:
                    // the editor's is meant for its larger title line.
                    className={comment(line) ? "text-info" : undefined}
                    style={comment(line) ? undefined : { color: piece.color }}
                  >
                    {piece.content}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </span>
      )}

      {preview && (
        <span className={cn(FOOT, "shrink-0")}>
          <span className="min-w-0 flex-1 text-fg-muted">
            {total === 0
              ? "Nothing written yet"
              : `${total} ${total === 1 ? "line" : "lines"}`}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-bold text-success">
            Open
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </span>
      )}
    </button>
  );
}

interface ScriptFrameProps {
  title: ReactNode;
  /** The line under the title. */
  meta?: ReactNode;
  /** Beside the title: buttons that act on the script. */
  actions?: ReactNode;
  /** The strip under the script. */
  footer?: ReactNode;
  /** In place of the script's mark, for a frame that holds something
   *  else beside a script's page (its timeline). */
  icon?: ReactNode;
  /** `false`: the frame keeps its colour, as a page that stays one. */
  settles?: boolean;
  /** `neutral`: an ordinary frame, for what stands beside the script's
   *  page without being it. */
  tone?: "brand" | "neutral";
  /** The level of its title: `h1` where the frame is the screen. */
  heading?: "h1" | "h2";
  /** A smaller head, for a frame that is a part of a view and is titled
   *  with what it is ("Script", "Timeline"), not with a name. */
  compact?: boolean;

  /** Same as a `ScriptPage`'s: the page it was opened from carries it. */
  transitionName?: string;
  /** Names the title alone for a view transition: it travels by itself
   *  to the title that carries the same name afterwards. */
  titleTransitionName?: string;
  className?: string;
  /** The script itself. */
  children: ReactNode;
}

/** A `ScriptPage`, opened: the same page, as tall as it is given, with
 *  the whole script in it. */
export function ScriptFrame({
  title,
  meta,
  actions,
  footer,
  icon,
  settles = true,
  tone = "brand",
  heading: Heading = "h1",
  compact = false,
  transitionName,
  titleTransitionName,
  className,
  children,
}: ScriptFrameProps) {
  // It arrives as the page it was opened from, green frame and all;
  // once it is the screen, the frame is an ordinary one.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!settles) return;
    const timer = setTimeout(() => setArrived(true), 350);
    return () => clearTimeout(timer);
  }, [settles]);

  const mark = (
    <span
      className={cn(
        "shrink-0",
        tone === "neutral" ? "text-fg-muted" : "text-success",
        compact ? "[&_svg]:size-4" : "[&_svg]:size-5",
      )}
    >
      {icon ?? <Code aria-hidden />}
    </span>
  );

  return (
    <div
      style={{ viewTransitionName: transitionName }}
      className={cn(
        FRAME,
        "flex min-h-0 flex-col transition-[border-color,box-shadow] duration-700",
        arrived && "border-edge [--shadow-color:transparent]",
        tone === "neutral" && "border-edge [--shadow-color:var(--edge-shadow)]",
        className,
      )}
    >
      <div className={cn("shrink-0 px-3.5", compact ? "py-2" : "py-3")}>
        <div className={HEAD}>
          {mark}
          <Heading
            style={{ viewTransitionName: titleTransitionName }}
            className={cn(NAME, size(compact), "m-0")}
          >
            {title}
          </Heading>
          {actions && (
            <div className="-my-1 flex shrink-0 items-center gap-1">
              {actions}
            </div>
          )}
        </div>
        {meta && <div className={META}>{meta}</div>}
      </div>
      <div className="min-h-0 flex-1 border-t-2 border-line bg-surface-well">
        {children}
      </div>
      {footer && (
        <div
          className={cn(
            FOOT,
            "shrink-0 transition-colors duration-700",
            arrived && "border-line bg-surface-1",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
