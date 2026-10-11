import type { SpaceMeta } from "@evmcrispr/space";
import { TrashIcon } from "@heroicons/react/24/solid";
import { cn, IconButton, Tooltip } from "@repo/ui";

function formatDate(time: number) {
  const d = new Date(time);
  return {
    month: d.toLocaleString("default", { month: "short" }).split(".")[0],
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
  };
}

type SavedScriptProps = {
  space: SpaceMeta;
  isActive?: boolean;
  mobile?: boolean;
  onItemClick(id: string): void;
  onItemRemove(id: string): void;
};

export function SavedScript({
  space,
  isActive,
  mobile = false,
  onItemRemove,
  onItemClick,
}: SavedScriptProps) {
  const { id, updatedAt } = space;
  const { day, month, year } = formatDate(updatedAt);
  const displayTitle = space.title;

  if (mobile)
    return (
      <div
        className={cn(
          "flex cursor-pointer items-center gap-2 border-b border-foreground/10 py-1.5 pl-3 pr-1",
          isActive && "border-l-2 border-l-primary bg-foreground/4 pl-2.5",
        )}
        onClick={() => onItemClick(id)}
      >
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 font-sans text-sm text-foreground">
            <span className="truncate">{displayTitle}</span>
          </p>
          <p className="font-sans text-xs text-muted-foreground">
            Updated <span className="capitalize">{month} </span>
            {day}, {year}
          </p>
        </div>
        <IconButton
          aria-label="Remove saved script"
          variant="ghost"
          size="sm"
          className="min-h-9 min-w-9 shrink-0 text-foreground/45"
          onClick={(e) => {
            e.stopPropagation();
            onItemRemove(id);
          }}
        >
          <TrashIcon className="size-4" />
        </IconButton>
      </div>
    );

  return (
    <div
      className={`cursor-pointer p-5 relative transition-colors ${
        isActive
          ? "bg-evm-gray-700 border-l-3 border-evm-green-400"
          : "bg-evm-gray-800 hover:bg-evm-gray-700"
      }`}
      onClick={() => onItemClick(id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-3 items-start">
          <h3 className="text-xl text-evm-yellow-300 font-head font-bold">
            {displayTitle}
          </h3>
          <span className="text-white font-head text-sm">
            Updated <span className="capitalize">{month} </span>
            {day}, {year}
          </span>
        </div>
      </div>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <IconButton
            aria-label="Remove saved script"
            variant="outline"
            className="absolute right-2.5 bottom-5 mr-[7px] border-evm-pink-300 text-evm-pink-300 hover:bg-evm-pink-300 hover:text-evm-gray-900 shadow-none hover:shadow-none active:shadow-none hover:translate-y-0 active:translate-y-0"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onItemRemove(id);
            }}
          >
            <TrashIcon className="w-4 h-4" />
          </IconButton>
        </Tooltip.Trigger>
        <Tooltip.Content variant="warning" side="top">
          Remove saved script
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}
