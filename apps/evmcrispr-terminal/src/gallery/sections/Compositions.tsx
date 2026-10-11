import {
  AuthorLabel,
  BackButton,
  Badge,
  Button,
  Card,
  Chip,
  DiffStat,
  IconButton,
  Input,
  Notice,
  PanelHeader,
  Row,
  Textarea,
  Time,
  Well,
} from "@repo/ui";
import { Ellipsis, Plus, Trash2, Undo2 } from "@repo/ui/icons";
import { type ReactNode, useState } from "react";
import {
  DIFF,
  NOW,
  REVISIONS,
  RUN_LOG,
  RUN_MARK,
  SCRIPT,
  SPACES,
} from "../fixtures";
import { Both } from "../kit";
import { OpenChat, RevisionActions } from "../parts";

function Screen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 font-head text-title font-bold text-fg">{name}</h3>
      <Both>
        <div className="flex w-full flex-col border-2 border-edge bg-surface-0">
          {children}
        </div>
      </Both>
    </div>
  );
}

function SpacesList() {
  return (
    <>
      <PanelHeader
        title="Spaces"
        actions={
          <IconButton variant="neutral" size="sm" aria-label="New space">
            <Plus aria-hidden />
          </IconButton>
        }
      />
      <div className="flex flex-col gap-2.5 p-2.5">
        <Input
          variant="search"
          aria-label="Search spaces"
          placeholder="Search spaces"
        />
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {SPACES.map((space, index) => (
            <Row
              key={space.id}
              as="li"
              emphasis="title"
              title={space.title}
              active={index === 0}
              onClick={() => {}}
              meta={
                <>
                  <Time at={space.updatedAt} now={NOW} format="day" />
                  {space.unreviewed && (
                    <Badge tone="unverified" dot>
                      unreviewed
                    </Badge>
                  )}
                  {space.run && (
                    <Badge
                      tone={space.run === "paused" ? "warning" : "success"}
                      dot
                    >
                      {RUN_MARK[space.run]}
                    </Badge>
                  )}
                </>
              }
              actions={
                <IconButton
                  variant="destructive"
                  size="sm"
                  aria-label={`Remove ${space.title}`}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              }
            />
          ))}
        </ul>
      </div>
    </>
  );
}

function Timeline() {
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState("r3");
  return (
    <>
      <PanelHeader
        emphasis="title"
        title="Fund the grants Safe"
        back={<BackButton label="Spaces" onClick={() => {}} />}
        actions={
          <IconButton variant="quiet" size="sm" aria-label="Space menu">
            <Ellipsis aria-hidden />
          </IconButton>
        }
      />
      <div className="flex flex-col gap-2.5 p-2.5">
        <div className="flex flex-wrap gap-2">
          {["All", "Revisions", "Runs"].map((name) => (
            <Chip
              key={name}
              selected={filter === name}
              onSelectedChange={() => setFilter(name)}
            >
              {name}
            </Chip>
          ))}
        </div>
        {REVISIONS.map((revision) => (
          <Row
            key={revision.id}
            wrap
            open={open === revision.id}
            onOpenChange={(next) => setOpen(next ? revision.id : "")}
            actions={revision.who !== "You" ? <OpenChat /> : undefined}
            title={
              <>
                <AuthorLabel name={revision.who} /> {revision.what}
              </>
            }
            meta={
              <>
                <DiffStat added={revision.added} removed={revision.removed} />
                <Time at={revision.ts} now={NOW} />
                {revision.shared && <Badge>shared</Badge>}
                {revision.unreviewed && (
                  <Badge tone="unverified">unreviewed</Badge>
                )}
              </>
            }
          >
            <RevisionActions
              byOthers={revision.who !== "You"}
              shared={revision.shared}
            />
          </Row>
        ))}
        <Card
          aria-label="Simulation, succeeded"
          open={false}
          onOpenChange={() => {}}
        >
          <Card.Header
            title="Simulation"
            status={<Badge tone="success">succeeded</Badge>}
            time={<Time at={NOW - 11 * 60_000} now={NOW} format="clock" />}
          />
        </Card>
        <Card tone="warning" aria-label="Run, paused">
          <Card.Header
            title="Run"
            status={
              <Badge tone="warning" dot>
                paused
              </Badge>
            }
            time={<Time at={NOW - 7 * 60_000} now={NOW} format="clock" />}
          />
          <Card.Body>
            <Well size="sm">{RUN_LOG}</Well>
            You declined in your wallet. Held: transfer 2,500 WXDAI to the
            grants Safe.
          </Card.Body>
          <Card.Footer>
            <Button variant="neutral" size="sm">
              Cancel
            </Button>
            <Button variant="primary" size="sm">
              Resume
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </>
  );
}

function Review() {
  return (
    <>
      <PanelHeader title="Review changes" />
      <div className="flex flex-col gap-3.5 p-3">
        <Notice tone="unverified" title="1 change you have not reviewed">
          Since the script you last approved.
        </Notice>
        <Row
          wrap
          title={
            <>
              <AuthorLabel name="Assistant" /> split the transfer in two and
              added the 0.3% fee before the swap
            </>
          }
          meta={
            <>
              <DiffStat added={3} removed={1} />
              <Time at={NOW - 12 * 60_000} now={NOW} />
            </>
          }
          actions={
            <Button variant="quiet" size="row" icon={<Undo2 />}>
              Undo this change
            </Button>
          }
        />
        <Well>{DIFF}</Well>
        <Card aria-label="What the script would do">
          <Card.Header
            title="What the script would do"
            status={<Badge tone="success">simulated</Badge>}
          />
          <Card.Body>
            <Row
              title="Transfer 2,492.5 WXDAI to the grants Safe"
              meta="Gnosis"
            />
            <Row title="Transfer 7.5 WXDAI to you" meta="Gnosis" />
          </Card.Body>
        </Card>
        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <Button variant="neutral">Not now</Button>
          <Button variant="primary">Approve</Button>
        </div>
      </div>
    </>
  );
}

function Chat() {
  return (
    <>
      <PanelHeader
        title="Assistant"
        actions={
          <IconButton variant="neutral" size="sm" aria-label="New chat">
            <Plus aria-hidden />
          </IconButton>
        }
      />
      <div className="flex flex-col gap-3.5 p-3">
        <p className="m-0 max-w-4/5 self-end border-2 border-edge bg-surface-active px-2.5 py-1.5 font-sans text-body text-fg">
          Take a 0.3% fee before sending to the Safe.
        </p>
        <Card aria-label="Script changed">
          <Card.Header
            title="Script changed"
            status={<DiffStat added={3} removed={1} />}
            actions={
              <Button variant="quiet" size="row">
                See revision
              </Button>
            }
          />
          <Card.Body>
            Split the transfer in two and added the 0.3% fee before the swap.
          </Card.Body>
        </Card>
        <Card
          aria-label="Simulation of the script, succeeded"
          open
          onOpenChange={() => {}}
        >
          <Card.Header
            title="Simulation"
            status={<Badge tone="success">2 transactions</Badge>}
          />
          <Card.Body>
            <Well size="sm">{SCRIPT}</Well>
          </Card.Body>
        </Card>
        <Card tone="warning" aria-label="Permission needed">
          <Card.Header title="Edit another space?" />
          <Card.Body>
            The assistant wants to change "Swap on Gnosis", which is not on
            screen.
          </Card.Body>
          <Card.Footer>
            <Button variant="neutral" size="sm">
              Deny
            </Button>
            <Button variant="neutral" size="sm">
              Allow once
            </Button>
          </Card.Footer>
        </Card>
        <Textarea
          variant="quiet"
          aria-label="Message"
          rows={2}
          placeholder="Describe what to do…"
        />
      </div>
    </>
  );
}

export function Compositions() {
  return (
    <section
      id="compositions"
      className="flex flex-col gap-8 border-t-2 border-line py-8"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-head text-display font-bold text-fg">
          Compositions
        </h2>
        <p className="m-0 max-w-prose font-sans text-body text-fg-muted">
          The main screens, built from the components above and nothing else.
        </p>
      </div>
      <Screen name="Spaces list">
        <SpacesList />
      </Screen>
      <Screen name="Timeline">
        <Timeline />
      </Screen>
      <Screen name="Review">
        <Review />
      </Screen>
      <Screen name="Assistant chat">
        <Chat />
      </Screen>
    </section>
  );
}
