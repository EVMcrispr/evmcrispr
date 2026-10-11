import { cn } from "../utils";

interface AuthorLabelProps {
  /** Who the app can say did it. */
  name: string;
  /** Who the record says did it, when nothing backs that up. */
  claimed?: string;
  className?: string;
}

/** Who did something. A name that is only claimed is never shown as
 *  the author: the source is, marked unverified, with the claim after. */
export function AuthorLabel({ name, claimed, className }: AuthorLabelProps) {
  return (
    <span className={className}>
      <span
        className={cn("font-bold", claimed ? "text-unverified" : "text-fg")}
      >
        {name}
      </span>
      {claimed && (
        <>
          {" "}
          <span className="text-fg-faint">(it names {claimed})</span>
        </>
      )}
    </span>
  );
}
