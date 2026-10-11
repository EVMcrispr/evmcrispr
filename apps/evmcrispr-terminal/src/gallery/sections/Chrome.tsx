import {
  BackButton,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Notice,
  PanelHeader,
  Spinner,
  Textarea,
} from "@repo/ui";
import { Ellipsis, Plus } from "@repo/ui/icons";
import { Both, Example, Section } from "../kit";

const TONES = ["info", "success", "warning", "danger", "unverified"] as const;

export function Chrome() {
  return (
    <Section id="chrome" title="Headers, notices, fields">
      <Both>
        <Example label="panel header: detail view with back, title, actions">
          <div className="w-full bg-surface-1">
            <PanelHeader
              emphasis="title"
              title="Fund the grants Safe before the vote closes"
              back={<BackButton label="Spaces" onClick={() => {}} />}
              actions={
                <>
                  <Badge variant="count" tone="warning">
                    1
                  </Badge>
                  <IconButton variant="quiet" size="sm" aria-label="Space menu">
                    <Ellipsis aria-hidden />
                  </IconButton>
                </>
              }
            />
          </div>
        </Example>
        <Example label="panel header: top level">
          <div className="w-full bg-surface-1">
            <PanelHeader
              title="Spaces"
              actions={
                <IconButton variant="neutral" size="sm" aria-label="New space">
                  <Plus aria-hidden />
                </IconButton>
              }
            />
          </div>
        </Example>
        <Example label="notice, strip: the top of a surface">
          <div className="w-full">
            <Notice
              tone="warning"
              layout="strip"
              title="Viewing an earlier revision"
              action={
                <>
                  <Button variant="quiet" size="row">
                    Load in editor
                  </Button>
                  <Button variant="quiet" size="row">
                    Back to current
                  </Button>
                </>
              }
            >
              The script is untouched.
            </Notice>
          </div>
        </Example>
        <Example label="notice, block: each tone">
          <div className="flex w-full flex-col gap-3.5">
            {TONES.map((tone) => (
              <Notice key={tone} tone={tone} title={tone}>
                What the reader should know, in one or two sentences.
              </Notice>
            ))}
          </div>
        </Example>
        <Example label="notice, inline: under a field">
          <div className="flex flex-col gap-1">
            <Notice tone="danger" layout="inline">
              The link is not valid.
            </Notice>
            <Notice tone="warning" layout="inline">
              Exports and links made earlier still contain what they contained.
            </Notice>
          </div>
        </Example>
        <Example label="empty state: alone, with an action">
          <div className="flex w-full flex-col gap-2">
            <EmptyState>Nothing has happened in this space yet.</EmptyState>
            <EmptyState
              action={
                <Button variant="neutral" size="sm">
                  New space
                </Button>
              }
            >
              No space matches "treasury".
            </EmptyState>
          </div>
        </Example>
        <Example label="loading: a surface that is not ready">
          <div className="flex w-full items-center justify-center gap-2 py-6 font-sans text-body text-fg-faint">
            <Spinner label="Opening the space" />
            Opening the space
          </div>
        </Example>
        <Example label="fields: search, quiet, disabled">
          <div className="flex w-full flex-col gap-2">
            <Input
              variant="search"
              aria-label="Search spaces"
              placeholder="Search spaces"
            />
            <Input
              variant="quiet"
              aria-label="Safe address"
              defaultValue="0x4f2083f5fBede34C2714aFfb3105539775f7FE64"
            />
            <Input
              variant="quiet"
              aria-label="Safe address, disabled"
              placeholder="0x…"
              disabled
            />
          </div>
        </Example>
        <Example label="read-only with a copy action, and an error under it">
          <div className="flex w-full flex-col gap-1.5">
            <div className="flex w-full items-center gap-3">
              <Input
                variant="quiet"
                aria-label="Export link"
                readOnly
                value="https://evmcrispr.com/#/ipfs/bafybeigdyrzt5…#k=Zm9v"
              />
              <Button variant="neutral" size="sm">
                Copy
              </Button>
            </div>
            <Notice tone="danger" layout="inline">
              Could not pin the export. Try again.
            </Notice>
          </div>
        </Example>
        <Example label="textarea: the composer">
          <Textarea
            variant="quiet"
            aria-label="Message"
            rows={3}
            placeholder="Describe what to do…"
          />
        </Example>
      </Both>
    </Section>
  );
}
