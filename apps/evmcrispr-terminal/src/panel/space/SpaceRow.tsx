import type { SpaceMeta } from "@evmcrispr/space";
import { TrashIcon } from "@heroicons/react/24/solid";
import { cn, IconButton } from "@repo/ui";
import { day } from "./time";

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
    <li
      className={cn(
        "flex items-center gap-2 border-l-2 py-2 pl-3 pr-1 transition-colors",
        active
          ? "border-l-primary bg-evm-gray-700"
          : "border-l-transparent bg-evm-gray-800 hover:bg-evm-gray-700",
      )}
    >
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        className="min-w-0 flex-1 cursor-pointer text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(meta.id)}
      >
        <span className="block truncate font-head text-base text-evm-yellow-300">
          {meta.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 font-sans text-xs text-foreground/55">
          <span>Updated {day(meta.updatedAt)}</span>
          {meta.unreviewed && (
            <span className="flex items-center gap-1 text-evm-orange-300">
              <span className="size-1.5 rounded-full bg-evm-orange-300" />
              unreviewed
            </span>
          )}
          {meta.run && (
            <span
              className={cn(
                "flex items-center gap-1",
                meta.run === "paused"
                  ? "text-evm-yellow-300"
                  : "text-evm-green-300",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {RUN_MARK[meta.run]}
            </span>
          )}
        </span>
      </button>
      <IconButton
        type="button"
        aria-label={`Remove ${meta.title}`}
        title="Remove space"
        variant="ghost"
        size="sm"
        className="min-h-9 min-w-9 shrink-0 text-foreground/45 hover:text-evm-pink-300"
        onClick={() => onRemove(meta.id)}
      >
        <TrashIcon className="size-4" />
      </IconButton>
    </li>
  );
}
