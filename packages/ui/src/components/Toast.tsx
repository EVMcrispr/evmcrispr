"use client";

// Adapted from the neobrutalism.dev Toast (MIT), which is built on
// Base UI. RetroUI's own toasts are still on Sonner.
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../utils";

const manager = ToastPrimitive.createToastManager();

type ToastType = "success" | "error" | "warning" | "info" | "loading";

interface ToastOptions {
  /** Given the id of a toast on screen, that toast is replaced. */
  id?: string;
  description?: string;
  /** Milliseconds before it goes; 0 keeps it until dismissed. */
  duration?: number;
}

function show(
  type: ToastType | undefined,
  message: string,
  options?: ToastOptions,
) {
  return manager.add({
    id: options?.id,
    title: message,
    description: options?.description,
    type,
    // A loading toast stays until what it waits for replaces it.
    timeout: options?.duration ?? (type === "loading" ? 0 : undefined),
  });
}

/** Shows a toast from anywhere, inside React or not. Each call returns
 *  the toast's id; passing that id again replaces the toast in place. */
export const toast = Object.assign(
  (message: string, options?: ToastOptions) =>
    show(undefined, message, options),
  {
    success: (message: string, options?: ToastOptions) =>
      show("success", message, options),
    error: (message: string, options?: ToastOptions) =>
      show("error", message, options),
    warning: (message: string, options?: ToastOptions) =>
      show("warning", message, options),
    info: (message: string, options?: ToastOptions) =>
      show("info", message, options),
    loading: (message: string, options?: ToastOptions) =>
      show("loading", message, options),
    dismiss: (id?: string) => manager.close(id),
  },
);

// Written out in full: Tailwind finds class names by reading the source.
const TONE: Record<string, string> = {
  success: "border-success [--shadow-color:var(--success-line)]",
  error: "border-danger [--shadow-color:var(--danger-line)]",
  warning: "border-warning [--shadow-color:var(--warning-line)]",
  info: "border-info [--shadow-color:var(--info-line)]",
  loading: "border-edge [--shadow-color:var(--edge-shadow)]",
};

const ICON: Record<string, ReactNode> = {
  success: <CircleCheck aria-hidden className="text-success" />,
  error: <OctagonX aria-hidden className="text-danger" />,
  warning: <TriangleAlert aria-hidden className="text-warning" />,
  info: <Info aria-hidden className="text-info" />,
  // The wrapper turns, on its own layer: see the note in the
  // console's BoxCard.
  loading: (
    <span className="block size-4 animate-spin will-change-transform">
      <LoaderCircle aria-hidden className="block text-fg-muted" />
    </span>
  ),
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      swipeDirection={["up", "left", "right"]}
      className={cn(
        // A stack that hangs from the top: the newest in front, the
        // older ones peeking out below it until the stack is hovered.
        "group/toast pointer-events-auto absolute top-0 right-0 left-0 z-[calc(1000-var(--toast-index))] w-full origin-top rounded-(--radius) border-2 bg-surface-2 text-fg shadow-md will-change-transform outline-hidden select-none focus-visible:ring-2 focus-visible:ring-ring",
        TONE[item.type ?? ""] ?? TONE.loading,
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)]",
        "data-ending-style:opacity-0 [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
      )}
    >
      <ToastPrimitive.Content className="flex h-full items-center gap-3 overflow-hidden px-4 py-3 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
        {ICON[item.type ?? ""] && (
          <span className="shrink-0 [&_svg]:size-4">
            {ICON[item.type ?? ""]}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastPrimitive.Title className="m-0 font-sans text-body font-medium" />
          <ToastPrimitive.Description className="m-0 font-sans text-caption text-fg-muted" />
        </div>
        <ToastPrimitive.Close
          aria-label="Close"
          className="relative shrink-0 cursor-pointer rounded-(--radius) p-1 text-fg-faint outline-hidden transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-4" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}

/** Where toasts appear: top centre, as before. Mounted once per app. */
export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={manager}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-4 top-4 z-[30000] mx-auto w-auto max-w-sm outline-hidden">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
