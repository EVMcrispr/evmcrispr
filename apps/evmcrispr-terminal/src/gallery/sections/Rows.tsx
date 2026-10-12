import {
  AuthorLabel,
  Badge,
  DiffStat,
  IconButton,
  Row,
  ScriptFrame,
  ScriptPage,
  Time,
} from "@repo/ui";
import { MessageSquare, Trash2 } from "@repo/ui/icons";
import { useState } from "react";
import { Both, Example, Section } from "../kit";
import { OpenChat, RevisionActions } from "../parts";

const NOW = Date.now();
const LONG =
  "Rebalance the treasury across three vaults and bridge the remainder to Gnosis before the vote";

const SCRIPT = `# Fund the grants Safe
load safe
set $safe 0x1234567890123456789012345678901234567890
exec @token(DAI) "transfer(address,uint256)" $safe 5000e18
print "sent"
print "done"`;

function Remove({ name }: { name: string }) {
  return (
    <IconButton variant="destructive" size="sm" aria-label={`Remove ${name}`}>
      <Trash2 aria-hidden />
    </IconButton>
  );
}

export function Rows() {
  const [open, setOpen] = useState("r2");
  const [refused, setRefused] = useState(true);
  const toggle = (id: string) => (next: boolean) => setOpen(next ? id : "");
  return (
    <Section
      id="rows"
      title="Rows"
      note="One row for every list: spaces, chats, revisions, pinned runs, reference items. A row is framed and has no shadow; the active one is the exception."
    >
      <Both>
        <Example label="a named thing: default, active with marks, long">
          <ul className="flex w-full flex-col gap-2">
            <Row
              as="li"
              emphasis="title"
              title="Swap on Gnosis"
              meta={<Time at={NOW - 3_600_000} now={NOW} format="day" />}
              onClick={() => {}}
              actions={<Remove name="Swap on Gnosis" />}
            />
            <Row
              as="li"
              emphasis="title"
              title="Fund the grants Safe"
              active
              meta={
                <>
                  <Time at={NOW - 600_000} now={NOW} format="day" />
                  <Badge tone="unverified" dot>
                    unreviewed
                  </Badge>
                  <Badge tone="warning" dot>
                    run paused
                  </Badge>
                </>
              }
              onClick={() => {}}
              actions={<Remove name="Fund the grants Safe" />}
            />
            <Row
              as="li"
              emphasis="title"
              title={LONG}
              meta={
                <>
                  <Time at={NOW - 86_400_000 * 3} now={NOW} format="day" />
                  <Badge tone="success" dot>
                    running
                  </Badge>
                </>
              }
              onClick={() => {}}
              actions={<Remove name="the long one" />}
            />
          </ul>
        </Example>
        <Example label="a script, above what happened to it: its first lines as the editor colours them; one with nothing written; the head alone">
          <div className="flex w-full flex-col gap-2">
            <ScriptPage
              title="Fund the grants Safe"
              text={SCRIPT}
              meta={
                <>
                  <span>
                    Updated <Time at={NOW - 600_000} now={NOW} format="day" />
                  </span>
                  <Badge tone="unverified" dot>
                    unreviewed
                  </Badge>
                </>
              }
              onClick={() => {}}
            />
            <ScriptPage title="Untitled" text="" onClick={() => {}} />
            <ScriptPage
              compact
              preview={false}
              title="Script"
              text={SCRIPT}
              meta={<span>Updated today</span>}
              onClick={() => {}}
            />
          </div>
        </Example>
        <Example label="the same script, opened: the page with all of it">
          <ScriptFrame
            className="h-64 w-full"
            title="Fund the grants Safe"
            meta={
              <>
                <span>Read-only here · edit through chat</span>
                <Badge variant="tag" tone="success" dot>
                  Valid
                </Badge>
              </>
            }
            actions={<Remove name="Fund the grants Safe" />}
            footer={
              <span className="text-fg-muted">
                Nothing is sent until you review and confirm in your wallet.
              </span>
            }
          >
            <pre className="m-0 overflow-hidden p-3 font-mono text-caption text-fg-muted">
              {SCRIPT}
            </pre>
          </ScriptFrame>
        </Example>
        <Example label="a revision: your own, an agent's (with the way to its chat), and one whose undo was refused">
          <div className="flex w-full flex-col gap-2">
            <Row
              wrap
              open={open === "r1"}
              onOpenChange={toggle("r1")}
              title={
                <>
                  <AuthorLabel name="You" /> edited the script
                </>
              }
              meta={
                <>
                  <DiffStat added={4} removed={1} />
                  <Time at={NOW - 7_200_000} now={NOW} />
                </>
              }
            >
              <RevisionActions />
            </Row>
            <Row
              wrap
              open={open === "r2"}
              onOpenChange={toggle("r2")}
              actions={<OpenChat />}
              title={
                <>
                  <AuthorLabel name="Assistant" /> added the 0.3% fee to the
                  swap and moved the approval before it
                </>
              }
              meta={
                <>
                  <DiffStat added={12} removed={3} />
                  <Time at={NOW - 300_000} now={NOW} />
                  <Badge>shared</Badge>
                  <Badge tone="unverified">unreviewed</Badge>
                </>
              }
            >
              <RevisionActions byOthers shared />
            </Row>
            <Row
              wrap
              open={refused}
              onOpenChange={setRefused}
              actions={<OpenChat />}
              title={
                <>
                  <AuthorLabel name="Assistant" /> renamed the recipient
                  variable
                </>
              }
              meta={
                <>
                  <DiffStat added={1} removed={0} />
                  <Time at={NOW - 86_400_000} now={NOW} />
                </>
              }
            >
              <RevisionActions byOthers refused />
            </Row>
          </div>
        </Example>
        <Example label="with a leading icon, as a link, disabled, plain">
          <div className="flex w-full flex-col gap-2">
            <Row
              leading={<MessageSquare aria-hidden className="size-4" />}
              title="Swap with a fee"
              meta="Started in Swap on Gnosis · 2 h ago"
              onClick={() => {}}
            />
            <Row
              title="exec"
              meta="Calls a function of a contract."
              href="#rows"
            />
            <Row
              title="Messages"
              meta="When spaces are shared"
              onClick={() => {}}
              disabled
            />
            <Row
              title="You cleared the timeline"
              meta={<Time at={NOW - 86_400_000 * 2} now={NOW} />}
            />
          </div>
        </Example>
      </Both>
    </Section>
  );
}
