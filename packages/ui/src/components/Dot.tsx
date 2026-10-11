import { TONE_TEXT, type Tone } from "../tone";
import { cn } from "../utils";

interface DotProps {
  tone?: Tone;
  /** Given when the dot stands alone and has to say what it means. */
  label?: string;
  className?: string;
}

/** A status dot. Beside a word it is decoration; alone it needs a label. */
export function Dot({ tone = "neutral", label, className }: DotProps) {
  const classes = cn(
    "inline-block size-2 shrink-0 rounded-full bg-current",
    TONE_TEXT[tone],
    className,
  );
  return label ? (
    <span role="img" aria-label={label} className={classes} />
  ) : (
    <span aria-hidden className={classes} />
  );
}
