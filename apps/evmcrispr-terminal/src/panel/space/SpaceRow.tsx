import type { SpaceMeta } from "@evmcrispr/space";
import { Badge, IconButton, Row, Time } from "@repo/ui";
import { Trash2 } from "@repo/ui/icons";
import { DISPLACED, SCRIPT_MORPH, TITLE_MORPH } from "../../app/morph";
import { UnreviewedBadge } from "../../review/state";

const RUN_MARK: Record<NonNullable<SpaceMeta["run"]>, string> = {
  running: "running",
  paused: "run paused",
  watching: "watching",
};

/** One space in the list: its title, when it last changed, and marks
 *  that say what goes on inside without opening it. */
export function SpaceRow({
  meta,
  active,
  part,
  onOpen,
  onRemove,
}: {
  meta: SpaceMeta;
  active: boolean;
  /** Its part when a space opens from the list or closes into it: the
   *  row that becomes the space, or one it pushes away, above or below.
   *  Left out, the row takes no part. */
  part?: "self" | "above" | "below";
  onOpen(id: string): void;
  onRemove(id: string): void;
}) {
  return (
    <Row
      as="li"
      emphasis="title"
      title={meta.title}
      active={active}
      transitionName={
        part === "self" ? SCRIPT_MORPH : part && `space-row-${meta.id}`
      }
      titleTransitionName={part === "self" ? TITLE_MORPH : undefined}
      transitionClass={part && part !== "self" ? DISPLACED[part] : undefined}
      onClick={() => onOpen(meta.id)}
      meta={
        <>
          <span>
            Updated <Time at={meta.updatedAt} format="day" />
          </span>
          {meta.unreviewed && <UnreviewedBadge dot />}
          {meta.run && (
            <Badge tone={meta.run === "paused" ? "warning" : "success"} dot>
              {RUN_MARK[meta.run]}
            </Badge>
          )}
        </>
      }
      actions={
        <IconButton
          type="button"
          aria-label={`Remove ${meta.title}`}
          title="Remove space"
          variant="destructive"
          size="sm"
          onClick={() => onRemove(meta.id)}
        >
          <Trash2 aria-hidden />
        </IconButton>
      }
    />
  );
}
