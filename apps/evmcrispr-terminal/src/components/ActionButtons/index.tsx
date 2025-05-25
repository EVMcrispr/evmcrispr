import { useAccount } from "wagmi";
import { VStack, useDisclosure } from "@chakra-ui/react";
import { useEffect } from "react";

import LogModal from "../LogModal";
import ErrorMsg from "./ErrorMsg";

import { useTerminalStore } from "../TerminalEditor/use-terminal-store";
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

  const { executeScript, logs } = useTransactionExecutor(
    address,
    maximizeGasLimit,
    script,
    safeConnectorInstance,
  );

  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: onLogModalClose,
  } = useDisclosure();

  useEffect(() => {
    if (logs && logs.length > 0) {
      onLogModalOpen();
    }
  }, [logs, onLogModalOpen]);

  const handleExecute = (inBatch: boolean) => {
    executeScript(inBatch);
  };

  return (
    <>
      <VStack
        mt={3}
        alignItems="flex-end"
        spacing={3}
        height="60px"
        pr={{ base: 6, lg: 0 }}
        width="100%"
      >
        {address ? (
          <ExecuteButton isLoading={isLoading} onExecute={handleExecute} />
        ) : null}
        {errors && errors.length > 0 ? <ErrorMsg errors={errors} /> : null}
      </VStack>
      <LogModal
        isOpen={isLogModalOpen}
        logs={logs}
        closeModal={onLogModalClose}
      />
    </>
  );
}
