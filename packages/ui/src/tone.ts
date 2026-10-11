/** What a mark, a card or a notice says about its content. */
export type Tone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "unverified";

// Written out in full: Tailwind finds class names by reading the source.
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  unverified: "text-unverified",
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-surface-2",
  success: "bg-success-surface",
  warning: "bg-warning-surface",
  danger: "bg-danger-surface",
  info: "bg-info-surface",
  unverified: "bg-unverified-surface",
};

/** The 2px frame of a block in that tone, and the colour of its hard
 *  shadow. */
export const TONE_EDGE: Record<Tone, string> = {
  neutral: "border-edge [--shadow-color:var(--edge-shadow)]",
  success: "border-success [--shadow-color:var(--success-line)]",
  warning: "border-warning [--shadow-color:var(--warning-line)]",
  danger: "border-danger [--shadow-color:var(--danger-line)]",
  info: "border-info [--shadow-color:var(--info-line)]",
  unverified: "border-unverified [--shadow-color:var(--unverified-line)]",
};
