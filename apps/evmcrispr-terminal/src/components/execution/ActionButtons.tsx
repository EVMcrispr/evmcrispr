import { useAccount } from "wagmi";

import LogModal from "./LogModal";
import ErrorMsg from "./ErrorMsg";

import { useTerminalStore } from "../../stores/terminal-store";
import { ExecuteButton } from "./ExecuteButton";
import { useTransactionExecutor } from "../../hooks/useTransactionExecutor";

type ActionButtonsType = {
  address: `0x${string}` | undefined;
  maximizeGasLimit: boolean;
};

export default function ActionButtons({
  address,
  maximizeGasLimit,
}: ActionButtonsType) {
  const { errors, isLoading, script } = useTerminalStore();

  const { connector: activeConnector } = useAccount();
  const isSafe = activeConnector?.id === "safe";
  const safeConnectorInstance = isSafe ? activeConnector : undefined;

  const { executeScript, logs, isLogModalOpen, closeLogModal } =
    useTransactionExecutor(
      address,
      maximizeGasLimit,
      script,
      safeConnectorInstance,
    );

  const handleExecute = (inBatch: boolean) => {
    executeScript(inBatch);
  };

  return (
    <>
      <div className="flex flex-col items-end gap-3 mt-3 h-[60px] pr-6 lg:pr-0 w-full">
        {address ? (
          <ExecuteButton isLoading={isLoading} onExecute={handleExecute} />
        ) : null}
        {errors && errors.length > 0 ? <ErrorMsg errors={errors} /> : null}
      </div>
      <LogModal
        isOpen={isLogModalOpen}
        logs={logs}
        closeModal={closeLogModal}
      />
    </>
  );
}
