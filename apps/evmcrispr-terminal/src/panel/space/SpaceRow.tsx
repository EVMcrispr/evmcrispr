import type { SpaceMeta } from "@evmcrispr/space";
import { Badge, IconButton, Row, Time } from "@repo/ui";
import { Trash2 } from "@repo/ui/icons";

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
  onOpen,
  onRemove,
}: {
  meta: SpaceMeta;
  active: boolean;
  onOpen(id: string): void;
  onRemove(id: string): void;
}) {
  return (
    <Row
      as="li"
      emphasis="title"
      title={meta.title}
      active={active}
      onClick={() => onOpen(meta.id)}
      meta={
        <>
          <span>
            Updated <Time at={meta.updatedAt} format="day" />
          </span>
          {meta.unreviewed && (
            <Badge tone="unverified" dot>
              unreviewed
            </Badge>
          )}
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
