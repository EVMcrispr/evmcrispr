import { Button, IconButton, Spinner } from "@repo/ui";
import { Ellipsis, Eye, History, Play, Trash2, Undo2, X } from "@repo/ui/icons";
import { Both, Example, Section } from "../kit";

export function Buttons() {
  return (
    <Section
      id="buttons"
      title="Buttons"
      note="A raised button is a block with a hard shadow that it sinks into when pressed. Primary is used once per surface; neutral for other actions that stand alone; quiet inside rows, cards and notices."
    >
      <Both>
        <Example label="primary: the one main action of a surface">
          <Button variant="primary">
            <Play data-icon aria-hidden />
            Run
          </Button>
          <Button variant="primary" disabled>
            Run
          </Button>
          <Button variant="primary" loading>
            Simulating
          </Button>
        </Example>
        <Example label="neutral: another action that stands alone">
          <Button variant="neutral">Cancel</Button>
          <Button variant="neutral" disabled>
            Cancel
          </Button>
          <Button variant="neutral" loading>
            Sharing
          </Button>
        </Example>
        <Example label="destructive: confirm of an irreversible action">
          <Button variant="destructive">Clear timeline</Button>
          <Button variant="destructive" disabled>
            Clear timeline
          </Button>
        </Example>
        <Example label="sizes: sm, md, lg">
          <Button variant="primary" size="sm">
            Resume
          </Button>
          <Button variant="primary">Resume</Button>
          <Button variant="primary" size="lg">
            Resume
          </Button>
          <Button variant="neutral" size="sm">
            Copy link
          </Button>
        </Example>
        <Example label="quiet, size row: actions of a row or a card header; on touch only the icon shows">
          <Button variant="quiet" size="row" icon={<Eye />}>
            View
          </Button>
          <Button variant="quiet" size="row" icon={<Undo2 />}>
            Undo this change
          </Button>
          <Button variant="quiet" size="row" icon={<History />}>
            Restore to before
          </Button>
          <Button variant="quiet" size="row" icon={<Undo2 />} disabled>
            Undo this change
          </Button>
        </Example>
        <Example label="link">
          <Button variant="link" size="row">
            6 previous entries
          </Button>
        </Example>
        <Example label="icon buttons: neutral, quiet, destructive">
          <IconButton variant="neutral" size="sm" aria-label="Space menu">
            <Ellipsis aria-hidden />
          </IconButton>
          <IconButton variant="quiet" size="sm" aria-label="Close">
            <X aria-hidden />
          </IconButton>
          <IconButton variant="destructive" size="sm" aria-label="Remove space">
            <Trash2 aria-hidden />
          </IconButton>
          <IconButton variant="quiet" size="sm" aria-label="Close" disabled>
            <X aria-hidden />
          </IconButton>
        </Example>
        <Example label="spinner: sm, md">
          <span className="flex items-center gap-3 text-fg-muted">
            <Spinner />
            <Spinner size="md" />
          </span>
        </Example>
      </Both>
    </Section>
  );
}
