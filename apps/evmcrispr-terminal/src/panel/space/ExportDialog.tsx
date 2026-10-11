import { Button, Dialog, toast } from "@repo/ui";
import { useState } from "react";
import pinJSON from "../../api/pinata/pin-json";
import { useSpace } from "../../app/SpaceContext";
import { exportSpace } from "../../space/export";

/** Makes a link to an encrypted copy of the whole space. It is never held
 *  back by the review: it copies the space as it is. The address bar does
 *  not change. */
export function ExportDialog({ onClose }: { onClose(): void }) {
  const space = useSpace();
  const [state, setState] = useState<
    | { step: "ask" }
    | { step: "working" }
    | { step: "done"; url: string }
    | { step: "failed"; why: string }
  >({ step: "ask" });

  const create = async () => {
    if (!globalThis.crypto?.subtle)
      return setState({
        step: "failed",
        why: "Exporting needs a secure context (https).",
      });
    setState({ step: "working" });
    try {
      const exported = await exportSpace(space, {
        pin: pinJSON,
        origin: window.location.origin,
      });
      setState(
        exported.ok
          ? { step: "done", url: exported.url }
          : {
              step: "failed",
              why: `This space cannot be exported as it is: ${exported.why}. Clearing its timeline, or removing its largest runs, makes it fit.`,
            },
      );
    } catch {
      setState({
        step: "failed",
        why: "The space could not be saved to IPFS.",
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content size="md" className="outline-hidden" tabIndex={-1}>
        <Dialog.Header>Export space</Dialog.Header>
        <div className="flex flex-col gap-3 px-4 pb-4 font-sans text-sm text-foreground/80">
          <p>
            This makes a link to an encrypted copy of everything in this space:
            the script, every revision kept, every run and its output, and the
            links of the revisions you shared.
          </p>
          <p className="text-evm-yellow-300">
            Anyone who gets the link can read all of it, permanently. It cannot
            be taken back.
          </p>
          <p>
            Your chats with the assistant are not part of a space and are not
            included. Neither is what you approved: whoever opens the link
            decides that for themselves.
          </p>
          {state.step === "failed" && (
            <p role="alert" className="text-destructive">
              {state.why}
            </p>
          )}
          {state.step === "done" ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                aria-label="Link to the exported space"
                value={state.url}
                className="min-w-0 flex-1 border border-foreground/20 bg-black px-2 py-1 font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(state.url);
                  toast.success("The link is copied to the clipboard");
                }}
              >
                Copy
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={state.step === "working"}
                onClick={() => void create()}
              >
                {state.step === "working" ? "Encrypting…" : "Create link"}
              </Button>
            </div>
          )}
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
