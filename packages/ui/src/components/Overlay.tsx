"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../utils";

/** Below this width an overlay is a sheet. The terminal switches to its
 *  mobile layout at the same width (`MOBILE_BREAKPOINT`, 768). */
const SHEET_QUERY = "(max-width: 767px)";

function useSmallScreen() {
  const [small, setSmall] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(SHEET_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSmall(event.matches);
    setSmall(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return small;
}

interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Colours the title and the frame: `warning` for a caution,
   *  `danger` for a destructive confirm, `brand` for the app's own
   *  places (its menu, its docs). */
  tone?: "neutral" | "brand" | "warning" | "danger";
  /** Buttons, last one the main action. */
  footer?: ReactNode;
  /** Forces the form. Left out, the screen width decides. */
  sheet?: boolean;
  /** One line under the title. */
  description?: ReactNode;
  /** How wide the dialog may grow. A sheet is always the screen's width. */
  size?: "md" | "lg";
  /** The close button's name, when "Close" alone would not say what. */
  closeLabel?: string;
  /** `popup`: the overlay itself takes the focus on opening, not a
   *  button in it, so Enter or Space on opening presses nothing. */
  focus?: "first" | "popup";
  children: ReactNode;
}

const TITLE = {
  neutral: "text-fg",
  brand: "text-heading",
  warning: "text-warning",
  danger: "text-danger",
};

const EDGE = {
  neutral: "border-edge [--shadow-color:var(--edge-shadow)]",
  brand: "border-success [--shadow-color:var(--success-line)]",
  warning: "border-warning [--shadow-color:var(--warning-line)]",
  danger: "border-danger [--shadow-color:var(--danger-line)]",
};

const BACKDROP =
  "fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0";

const HEADER = "flex items-center gap-2 border-b-2 border-line px-4 py-2.5";

const DESCRIPTION = "m-0 font-sans text-caption text-fg-faint";

const HEADING = "m-0 truncate font-head text-display font-bold";

const CLOSE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-(--radius) border-2 border-transparent p-1 text-fg-faint outline-hidden transition-colors hover:border-edge hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11 touch:min-w-11";

const BODY =
  "flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3 font-sans text-body text-fg-muted";

const FOOTER =
  "flex flex-wrap items-center justify-end gap-3 border-t-2 border-line px-4 py-3";

/** Something that opens over the page: a dialog on a desktop, a sheet
 *  from the bottom on a small screen. Same title, body and footer. */
export function Overlay({
  open,
  onOpenChange,
  title,
  tone = "neutral",
  footer,
  sheet,
  description,
  size = "md",
  closeLabel = "Close",
  focus = "first",
  children,
}: OverlayProps) {
  const small = useSmallScreen();
  const popup = useRef<HTMLDivElement>(null);
  const initialFocus = focus === "popup" ? popup : undefined;
  const change = (next: boolean) => onOpenChange(next);

  if (sheet ?? small)
    return (
      <Drawer.Root open={open} onOpenChange={change} swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop className={BACKDROP} />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end">
            <Drawer.Popup
              ref={popup}
              initialFocus={initialFocus}
              data-overlay="sheet"
              // What the app's touch rules for buttons in a sheet key on.
              data-slot="drawer-popup"
              className={cn(
                "flex max-h-[96dvh] min-h-0 w-full flex-col rounded-t-(--radius) border-2 border-b-0 bg-surface-sheet outline-hidden transition-transform duration-300 [transform:translateY(var(--drawer-swipe-movement-y,0px))] data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:duration-0",
                EDGE[tone],
              )}
            >
              <div
                aria-hidden
                className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-edge"
              />
              <div className={HEADER}>
                <div className="min-w-0 flex-1">
                  <Drawer.Title className={cn(HEADING, TITLE[tone])}>
                    {title}
                  </Drawer.Title>
                  {description && (
                    <Drawer.Description className={DESCRIPTION}>
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close aria-label={closeLabel} className={CLOSE}>
                  <X aria-hidden className="size-5" />
                </Drawer.Close>
              </div>
              <Drawer.Content className={BODY}>{children}</Drawer.Content>
              {footer && (
                <div
                  className={cn(
                    FOOTER,
                    "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                  )}
                >
                  {footer}
                </div>
              )}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Popup
          ref={popup}
          initialFocus={initialFocus}
          data-overlay="dialog"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-(--radius) border-2 bg-surface-sheet shadow-lg outline-hidden transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            size === "lg" ? "max-w-3xl" : "max-w-lg",
            EDGE[tone],
          )}
        >
          <div className={HEADER}>
            <div className="min-w-0 flex-1">
              <Dialog.Title className={cn(HEADING, TITLE[tone])}>
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className={DESCRIPTION}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label={closeLabel} className={CLOSE}>
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className={BODY}>{children}</div>
          {footer && <div className={FOOTER}>{footer}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
