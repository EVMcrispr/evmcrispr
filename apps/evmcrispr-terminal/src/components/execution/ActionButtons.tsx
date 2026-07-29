import { useTerminalStore } from "../../stores/terminal-store";
import { ExecuteButton } from "./ExecuteButton";

type ActionButtonsType = {
  onExecute: () => void;
  onCancel: () => void;
};

export default function ActionButtons({
  onExecute,
  onCancel,
}: ActionButtonsType) {
  const isLoading = useTerminalStore((s) => s.isLoading);

  return (
    <div className="flex justify-end gap-3 mt-3 pr-6 lg:pr-0 w-full">
      <ExecuteButton
        isLoading={isLoading}
        onExecute={onExecute}
        onCancel={onCancel}
      />
    </div>
  );
}
