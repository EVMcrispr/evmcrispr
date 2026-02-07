import { Cog8ToothIcon } from "@heroicons/react/24/solid";

import { Popover } from "@/components/retroui/Popover";
import { Tooltip } from "@/components/retroui/Tooltip";
import { IconButton } from "@/components/retroui/IconButton";
import { Switch } from "@/components/retroui/Switch";

export default function ConfigureButton({
  maximizeGasLimit,
  setMaximizeGasLimit,
}: {
  maximizeGasLimit: boolean;
  setMaximizeGasLimit: Record<string, () => void>;
}) {
  return (
    <Popover>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Script configuration"
              variant="outline"
              size="md"
            >
              <Cog8ToothIcon className="w-5 h-5" />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Content side="top">Script configuration</Tooltip.Content>
      </Tooltip>
      <Popover.Content
        align="end"
        className="bg-evm-gray-900 border-evm-green-300 min-w-[300px]"
      >
        <p className="text-xl text-evm-green-300 font-head mb-2">
          Script Configuration
        </p>
        <div className="flex items-center gap-3">
          <label
            htmlFor="maximize-gas-limit"
            className="text-xl text-foreground font-head leading-tight"
          >
            Maximize gas limit?
          </label>
          <Switch
            id="maximize-gas-limit"
            checked={maximizeGasLimit}
            onCheckedChange={setMaximizeGasLimit.toggle}
          />
        </div>
      </Popover.Content>
    </Popover>
  );
}
