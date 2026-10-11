import { useLegacy } from "../../app/legacy-execution";
import { useUi } from "../../app/ui-store";
import { ExecuteButton } from "./ExecuteButton";

export default function ActionButtons() {
  const isLoading = useUi((s) => s.isLoading);
  const { execution } = useLegacy();

  return (
    <div className="flex justify-end gap-3 mt-3 pr-6 lg:pr-0 w-full">
      <ExecuteButton
        isLoading={isLoading}
        onExecute={() => void execution.executeScript()}
        onCancel={execution.cancelExecution}
      />
    </div>
  );
}
