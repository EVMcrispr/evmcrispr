import { Button, IconButton, Menu } from "@repo/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function ExecuteButton({
  isLoading,
  onExecute,
}: {
  isLoading: boolean;
  onExecute: (inBatch: boolean) => void;
}) {
  const [isBatch, setIsBatch] = useState(true);

  return (
    <div className="flex">
      <Button
        variant="default"
        onClick={() => onExecute(isBatch)}
        disabled={isLoading}
        size="md"
        className="rounded-r-none"
      >
        {isLoading
          ? "Executing..."
          : isBatch
            ? "Execute in batch"
            : "Execute one by one"}
      </Button>
      {!isLoading && (
        <Menu>
          <Menu.Trigger asChild>
            <IconButton
              variant="primary"
              size="md"
              className="rounded-l-none border-l border-l-evm-green-600"
              aria-label="Execution mode"
            >
              <ChevronDown className="w-4 h-4" />
            </IconButton>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item onClick={() => setIsBatch((v) => !v)}>
              {isBatch ? "Execute one by one" : "Execute in batch"}
            </Menu.Item>
          </Menu.Content>
        </Menu>
      )}
    </div>
  );
}
