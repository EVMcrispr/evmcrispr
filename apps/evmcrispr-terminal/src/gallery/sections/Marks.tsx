import {
  AuthorLabel,
  Badge,
  Chip,
  DiffStat,
  Dot,
  duration,
  Time,
} from "@repo/ui";
import { useState } from "react";
import { Both, Example, Section } from "../kit";

const TONES = [
  "neutral",
  "success",
  "warning",
  "danger",
  "info",
  "unverified",
] as const;

const FILTERS = ["All", "Revisions", "Runs"];
const NOW = Date.now();
const MINUTE = 60_000;

export function Marks() {
  const [filter, setFilter] = useState("All");
  return (
    <Section
      id="marks"
      title="Badges, chips, time, authors"
      note="A tone is a meaning, not a colour: success, warning, danger, info, and unverified for what nobody has vouched for."
    >
      <Both>
        <Example label="badge, plain: a word in a meta line">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </Example>
        <Example label="badge with dot: a state that is going on">
          <Badge tone="success" dot>
            running
          </Badge>
          <Badge tone="warning" dot>
            run paused
          </Badge>
          <Badge tone="unverified" dot>
            unreviewed
          </Badge>
        </Example>
        <Example label="badge, tag: the kind or state of a thing">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone} variant="tag">
              {tone}
            </Badge>
          ))}
        </Example>
        <Example label="badge, count">
          <Badge variant="count">4</Badge>
          <Badge variant="count" tone="warning">
            2
          </Badge>
          <Badge variant="count" tone="info">
            128
          </Badge>
        </Example>
        <Example label="dot alone, named">
          <Dot tone="success" label="Connected" />
          <Dot tone="warning" label="Run paused" />
          <Dot tone="danger" label="Failed" />
        </Example>
        <Example label="chips: a filter">
          {FILTERS.map((name) => (
            <Chip
              key={name}
              selected={filter === name}
              onSelectedChange={() => setFilter(name)}
            >
              {name}
            </Chip>
          ))}
          <Chip disabled>Messages</Chip>
        </Example>
        <Example label="diff stat">
          <DiffStat added={12} removed={3} />
          <DiffStat added={0} removed={41} />
        </Example>
        <Example label="time: relative, clock, day, duration">
          <span className="flex flex-wrap gap-3 font-sans text-caption text-fg-faint">
            <Time at={NOW - 20_000} now={NOW} />
            <Time at={NOW - 12 * MINUTE} now={NOW} />
            <Time at={NOW - 300 * MINUTE} now={NOW} />
            <Time at={NOW} now={NOW} format="clock" />
            <Time at={NOW - 4320 * MINUTE} now={NOW} format="day" />
            <span>paused for {duration(7 * MINUTE)}</span>
          </span>
        </Example>
        <Example label="author">
          <span className="flex flex-col gap-1 font-sans text-body text-fg-muted">
            <span>
              <AuthorLabel name="You" /> edited the script
            </span>
            <span>
              <AuthorLabel name="Assistant" /> added the fee to the swap
            </span>
            <span>
              <AuthorLabel name="An export" claimed="You" /> edited the script
            </span>
          </span>
        </Example>
      </Both>
    </Section>
  );
}
