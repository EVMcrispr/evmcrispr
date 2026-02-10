import { Button } from "@repo/ui";

export function ExecuteButton({
  isLoading,
  onExecute,
  disabled,
}: {
  isLoading: boolean;
  onExecute: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="default"
      onClick={onExecute}
      disabled={isLoading || disabled}
      size="md"
    >
      {isLoading ? "Executing..." : "Execute"}
    </Button>
  );
}
