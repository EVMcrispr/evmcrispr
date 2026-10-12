import { ErrorTooLargeToPin } from "@evmcrispr/core";
import { Button, Input, Notice, Overlay, toast } from "@repo/ui";
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
    } catch (e) {
      setState({
        step: "failed",
        why:
          e instanceof ErrorTooLargeToPin
            ? "The space is too large to export (256 KB at most). Clearing its timeline makes it smaller."
            : "The space could not be saved to IPFS.",
      });
    }
  };

  return (
    <Overlay
      open
      onOpenChange={(open) => !open && onClose()}
      title="Export space"
    >
      <p>
        This makes a link to an encrypted copy of everything in this space: the
        script, every revision kept, every run and its output, and the links of
        the revisions you shared.
      </p>
      <Notice tone="warning">
        Anyone who gets the link can read all of it, permanently. It cannot be
        taken back.
      </Notice>
      <p>
        Your chats with the assistant are not part of a space and are not
        included. Neither is what you approved: whoever opens the link decides
        that for themselves.
      </p>
      {state.step === "failed" && (
        <Notice tone="danger" layout="inline">
          {state.why}
        </Notice>
      )}
      {state.step === "done" ? (
        <div className="flex items-center gap-3">
          <Input
            variant="quiet"
            readOnly
            aria-label="Link to the exported space"
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="primary"
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
        <div className="flex justify-end gap-3">
          <Button type="button" variant="neutral" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={state.step === "working"}
            onClick={() => void create()}
          >
            {state.step === "working" ? "Encrypting…" : "Create link"}
          </Button>
        </div>
      )}
    </Overlay>
  );
}
