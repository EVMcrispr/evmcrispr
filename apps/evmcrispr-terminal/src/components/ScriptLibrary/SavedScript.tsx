import { TrashIcon } from "@heroicons/react/24/solid";

import { IconButton, Tooltip } from "@repo/ui";

import type { StoredScript } from "../../types";

function getDate(date: Date) {
  const parsedDate = new Date(date);

  return {
    month: parsedDate
      .toLocaleString("default", { month: "short" })
      .split(".")[0],
    day: parsedDate.getUTCDate(),
    year: parsedDate.getUTCFullYear(),
  };
}

type SavedScriptProps = {
  script: StoredScript;
  onItemClick(title: string): void;
  onItemRemove(title: string): void;
};

export function SavedScript({
  script,
  onItemRemove,
  onItemClick,
}: SavedScriptProps) {
  const { date, title } = script;
  const { day, month, year } = getDate(date);

  return (
    <div
      className="cursor-pointer bg-evm-gray-800 p-5 relative w-full hover:bg-evm-gray-700 transition-colors"
      onClick={() => onItemClick(title)}
    >
      <div className="flex flex-col gap-3 items-start">
        <h3 className="text-2xl text-evm-yellow-300 font-head font-bold">
          {title}
        </h3>
        <span className="text-white font-head">
          Created <span className="capitalize">{month} </span>
          {day}, {year}
        </span>
      </div>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <IconButton
            aria-label="Remove saved script"
            variant="outline"
            className="absolute right-2.5 bottom-2.5 border-evm-pink-300 text-evm-pink-300 hover:bg-evm-pink-300 hover:text-evm-gray-900 shadow-none hover:shadow-none active:shadow-none hover:translate-y-0 active:translate-y-0"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onItemRemove(title);
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
