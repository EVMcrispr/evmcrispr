import { Button, Dialog } from "@repo/ui";
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        size="sm"
        className="border-evm-pink-300 outline-hidden"
        tabIndex={-1}
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <Dialog.Header className="border-evm-pink-300 bg-black text-evm-pink-300">
          {title}
        </Dialog.Header>
        <div className="flex flex-col gap-3 px-4 pb-4 font-sans text-sm text-foreground/80">
          {children}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-evm-pink-300 text-black"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {action}
            </Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}

/** What a cleaning action does not reach, from the one table that says
 *  what each reaches (`REACH`). */
export function LeftBehind({ action }: { action: CleaningAction }) {
  return (
    <div className="text-evm-yellow-300">
      <p>What this does not reach:</p>
      <ul className="list-disc pl-5">
        {leftBehind(action).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
