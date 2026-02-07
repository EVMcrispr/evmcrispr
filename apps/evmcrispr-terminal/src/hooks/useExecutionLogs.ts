import { useCallback, useEffect, useState } from "react";

export function useExecutionLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogModalOpen, setLogModalOpen] = useState(false);

  const logListener = useCallback((log: string) => {
    setLogs((prevLogs) => [...prevLogs, log]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const closeLogModal = useCallback(() => {
    setLogModalOpen(false);
  }, []);

  // Auto-open the log modal when new logs arrive
  useEffect(() => {
    if (logs && logs.length > 0) {
      setLogModalOpen(true);
    }
  }, [logs]);

  return {
    logs,
    logListener,
    clearLogs,
    isLogModalOpen,
    closeLogModal,
  };
}
