import { ChevronRightIcon, TrashIcon } from "@heroicons/react/24/solid";

import { IconButton, Tooltip } from "@repo/ui";

import type { ScriptMeta } from "../../types/index";

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString("default", { month: "short" }).split(".")[0],
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
  };
}

function SavingSpinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin text-evm-green-400 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

type SavedScriptProps = {
  script: ScriptMeta;
  isActive?: boolean;
  isSaving?: boolean;
  liveTitle?: string;
  onItemClick(id: string): void;
  onItemRemove(id: string): void;
};

export function SavedScript({
  script,
  isActive,
  isSaving,
  liveTitle,
  onItemRemove,
  onItemClick,
}: SavedScriptProps) {
  const { id, updatedAt } = script;
  const { day, month, year } = formatDate(updatedAt);
  const displayTitle = (liveTitle ?? script.title) || "Untitled";

  return (
    <div
      className={`cursor-pointer p-5 relative w-full transition-colors ${
        isActive
          ? "bg-evm-gray-700 border-l-3 border-evm-green-400"
          : "bg-evm-gray-800 hover:bg-evm-gray-700"
      }`}
      onClick={() => onItemClick(id)}
    >
      <div className="flex items-start gap-3">
        {isActive && !isSaving && (
          <ChevronRightIcon className="w-5 h-5 text-evm-green-400 mt-1 shrink-0" />
        )}
        {isActive && isSaving && (
          <div className="mt-1.5">
            <SavingSpinner />
          </div>
        )}
        <div className="flex flex-col gap-3 items-start">
          <h3 className="text-2xl text-evm-yellow-300 font-head font-bold">
            {displayTitle}
          </h3>
          <span className="text-white font-head">
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
            className="absolute right-2.5 bottom-2.5 border-evm-pink-300 text-evm-pink-300 hover:bg-evm-pink-300 hover:text-evm-gray-900 shadow-none hover:shadow-none active:shadow-none hover:translate-y-0 active:translate-y-0"
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
