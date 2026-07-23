import { Button } from "@repo/ui";

export function ExecuteButton({
  isLoading,
  onExecute,
  onCancel,
  disabled,
}: {
  isLoading: boolean;
  onExecute: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  if (isLoading) {
    return (
      <Button variant="outline" onClick={onCancel} size="md">
        Cancel
      </Button>
    );
  }
  return (
    <Button variant="default" onClick={onExecute} disabled={disabled} size="md">
      Execute
    </Button>
  );
}
