import { Button } from "@repo/ui";

export function ExecuteButton({
  isLoading,
  onExecute,
}: {
  isLoading: boolean;
  onExecute: () => void;
}) {
  return (
    <Button
      variant="default"
      onClick={onExecute}
      disabled={isLoading}
      size="md"
    >
      {isLoading ? "Executing..." : "Execute"}
    </Button>
  );
}
