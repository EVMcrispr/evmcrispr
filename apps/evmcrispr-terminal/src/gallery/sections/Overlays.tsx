import { Button, Input, Notice, Overlay } from "@repo/ui";
import { useState } from "react";
import { Example, Section } from "../kit";

type Open = null | "dialog" | "sheet" | "danger-dialog" | "danger-sheet";

export function Overlays() {
  const [open, setOpen] = useState<Open>(null);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  return (
    <Section
      id="overlays"
      title="Overlays"
      note="One component: a dialog on a desktop, a sheet on a small screen. The same title, body and footer in both."
    >
      <Example label="export: as a dialog, as a sheet">
        <Button variant="neutral" onClick={() => setOpen("dialog")}>
          Open as dialog
        </Button>
        <Button variant="neutral" onClick={() => setOpen("sheet")}>
          Open as sheet
        </Button>
      </Example>
      <Example label="destructive confirm: as a dialog, as a sheet">
        <Button variant="neutral" onClick={() => setOpen("danger-dialog")}>
          Open confirm as dialog
        </Button>
        <Button variant="neutral" onClick={() => setOpen("danger-sheet")}>
          Open confirm as sheet
        </Button>
      </Example>

      <Overlay
        open={open === "dialog" || open === "sheet"}
        onOpenChange={close}
        sheet={open === "sheet"}
        title="Export space"
        footer={
          <>
            <Button variant="neutral" onClick={() => setOpen(null)}>
              Close
            </Button>
            <Button variant="primary">Copy link</Button>
          </>
        }
      >
        <p className="m-0">
          The link gives permanent access to everything in the space: the script
          and its whole timeline.
        </p>
        <Input
          variant="quiet"
          aria-label="Export link"
          readOnly
          value="https://evmcrispr.com/#/ipfs/bafybeigdyrzt5…#k=Zm9v"
        />
        <Notice tone="warning" layout="inline">
          Assistant chats are not part of a space and are not exported.
        </Notice>
      </Overlay>

      <Overlay
        open={open === "danger-dialog" || open === "danger-sheet"}
        onOpenChange={close}
        sheet={open === "danger-sheet"}
        tone="danger"
        title="Clear timeline"
        footer={
          <>
            <Button variant="neutral" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button variant="destructive">Clear timeline</Button>
          </>
        }
      >
        <p className="m-0">
          Removes every entry except the current script, runs that have not
          finished and shared revisions. This cannot be undone.
        </p>
        <Notice tone="warning" layout="inline">
          Exports and share links made earlier still contain what they
          contained.
        </Notice>
      </Overlay>
    </Section>
  );
}
