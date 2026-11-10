import type { ReactNode } from "react";
import { cn } from "../utils";

/** Named values, one per line: a name, then what it is (what a wallet
 *  shows before it signs). On a touch screen the value goes under its
 *  name. */
function FactsRoot({ children }: { children: ReactNode }) {
  return <dl className="m-0 flex flex-col gap-1.5">{children}</dl>;
}

function FactsItem({
  name,
  mono = false,
  children,
}: {
  name: ReactNode;
  /** The value is code: a function name, a hash. */
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 touch:grid-cols-1 touch:gap-0">
      <dt className="font-sans text-caption text-fg-faint">{name}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 wrap-anywhere text-body text-fg",
          mono ? "font-mono" : "font-sans",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export const Facts = Object.assign(FactsRoot, { Item: FactsItem });
