import { useCallback, useState } from "react";

export function useExecutionLogs() {
  const [logs, setLogs] = useState<string[]>([]);

  const logListener = useCallback((log: string) => {
    setLogs((prevLogs) => [...prevLogs, log]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    logListener,
    clearLogs,
  };
}
