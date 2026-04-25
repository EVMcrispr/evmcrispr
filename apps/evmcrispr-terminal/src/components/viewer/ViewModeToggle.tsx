import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/solid";
import { IconButton, Tooltip } from "@repo/ui";
import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  terminalStoreActions,
  useTerminalStore,
  type ViewMode,
} from "../../stores/terminal-store";
import { persistViewMode } from "../../utils/view-mode";

/** Toggle between read-only viewer and the full Monaco editor. */
export function ViewModeToggle() {
  const viewMode = useTerminalStore((s) => s.viewMode);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    const next: ViewMode = viewMode === "view" ? "edit" : "view";
    terminalStoreActions("viewMode", next);
    persistViewMode(next);

    // A manual toggle wins over any URL hint — clear `?mode=` so future
    // reloads obey the user's preference (and the URL stays clean for
    // share links).
    if (searchParams.has("mode")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("mode");
      setSearchParams(nextParams, { replace: true });
    }
    void navigate;
  }, [viewMode, searchParams, setSearchParams, navigate]);

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
          onClick={handleClick}
          size="md"
        >
          <Icon className="w-5 h-5" />
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top">{label}</Tooltip.Content>
    </Tooltip>
  );
}
