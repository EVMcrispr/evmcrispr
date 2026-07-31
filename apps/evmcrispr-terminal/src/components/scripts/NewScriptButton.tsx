import { PlusIcon } from "@heroicons/react/24/solid";
import { Button, IconButton, Tooltip } from "@repo/ui";
import { useNavigate } from "react-router";

import { flushAutoSave } from "../../hooks/useAutoSave";
import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
} from "../../stores/terminal-store";
import { getOrCreatePristineScript, setLastViewedScript } from "../../utils";

export default function NewScriptButton({
  showLabel = false,
  onCreated,
}: {
  showLabel?: boolean;
  onCreated?: () => void;
} = {}) {
  const navigate = useNavigate();

  function handleClick() {
    flushAutoSave();

    // Reuse an existing untouched script instead of stacking up new ones
    const id = getOrCreatePristineScript(SCRIPT_PLACEHOLDER);
    terminalStoreActions("currentScriptId", id);
    terminalStoreActions("title", "");
    terminalStoreActions("script", SCRIPT_PLACEHOLDER);
    setLastViewedScript(id);
    navigate(`/${id}`);
    onCreated?.();
  }

  if (showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full justify-start gap-3 px-3 font-sans text-xs shadow-none"
        onClick={handleClick}
      >
        <PlusIcon data-icon="inline-start" />
        New script
      </Button>
    );
  }

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="New script"
          variant="ghost"
          onClick={handleClick}
          size="md"
        >
          <PlusIcon className="w-5 h-5" />
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top">New script</Tooltip.Content>
    </Tooltip>
  );
}
