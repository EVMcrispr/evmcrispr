import { PlusIcon } from "@heroicons/react/24/solid";
import { IconButton, Tooltip } from "@repo/ui";
import { useNavigate } from "react-router";

import { flushAutoSave } from "../../hooks/useAutoSave";
import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
} from "../../stores/terminal-store";
import { createScript, setLastViewedScript } from "../../utils";

export default function NewScriptButton() {
  const navigate = useNavigate();

  function handleClick() {
    flushAutoSave();

    const id = createScript("", SCRIPT_PLACEHOLDER);
    terminalStoreActions("currentScriptId", id);
    terminalStoreActions("title", "");
    terminalStoreActions("script", SCRIPT_PLACEHOLDER);
    setLastViewedScript(id);
    navigate(`/${id}`);
  }

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="New script"
          variant="outline"
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
