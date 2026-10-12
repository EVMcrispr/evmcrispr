import { Button, Overlay } from "@repo/ui";
import type { ReactNode } from "react";
import { type CleaningAction, leftBehind } from "../../space/cleaning";

/** Asks before something that cannot be undone. It names what goes, the
 *  button that does it is never the one in focus, and closing it any
 *  other way does nothing. */
export function Confirm({
  title,
  children,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  /** What goes, and what does not. */
  children: ReactNode;
  /** The words on the button that does it. */
  action: string;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
    <Overlay
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      tone="danger"
      footer={
        <>
          <Button type="button" variant="neutral" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      {children}
    </Overlay>
  );
}

/** What a cleaning action does not reach, from the one table that says
 *  what each reaches (`REACH`). */
export function LeftBehind({ action }: { action: CleaningAction }) {
  return (
    <div className="text-warning">
      <p>What this does not reach:</p>
      <ul className="list-disc pl-5">
        {leftBehind(action).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
