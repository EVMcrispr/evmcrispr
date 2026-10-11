import type { ReactNode } from "react";

/** One titled part of the gallery. `id` is its anchor. */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex flex-col gap-4 border-t-2 border-line py-8"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-head text-display font-bold text-fg">{title}</h2>
        {note && (
          <p className="max-w-prose font-sans text-body text-fg-muted">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Frame({
  kind,
  children,
}: {
  kind: "desktop" | "touch";
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-sans text-caption text-fg-faint">
        {kind === "desktop" ? "Desktop" : "Touch, 390px"}
      </span>
      <div
        data-frame={kind}
        data-touch={kind === "touch" ? "" : undefined}
        className={
          kind === "touch"
            ? "flex w-97.5 max-w-full flex-col gap-5 overflow-x-auto border border-line bg-surface-0 p-4"
            : "flex w-full max-w-xl flex-col gap-5 overflow-x-auto border border-line bg-surface-0 p-4"
        }
      >
        {children}
      </div>
    </div>
  );
}

/** The same content with mouse sizes and, beside it, with touch sizes
 *  in a phone-wide frame. */
export function Both({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Frame kind="desktop">{children}</Frame>
      <Frame kind="touch">{children}</Frame>
    </div>
  );
}

/** One state of a component, with the name of that state. */
export function Example({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-caption text-fg-faint">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
