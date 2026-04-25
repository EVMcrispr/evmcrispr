import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/solid";
import { IconButton, Tooltip } from "@repo/ui";
import { useViewMode } from "../../hooks/useViewMode";

/** Toggle between read-only viewer and the full Monaco editor. */
export function ViewModeToggle() {
  const { viewMode, toggleViewMode } = useViewMode();

  const isViewing = viewMode === "view";
  const Icon = isViewing ? PencilSquareIcon : EyeIcon;
  const label = isViewing ? "Open editor" : "Open viewer";

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={label}
          aria-pressed={isViewing}
          variant="outline"
          onClick={toggleViewMode}
          size="md"
        >
          <Icon className="w-5 h-5" />
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top">{label}</Tooltip.Content>
    </Tooltip>
  );
}
