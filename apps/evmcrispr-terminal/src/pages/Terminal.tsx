import { useCallback, useEffect, useState } from "react";
import { ScrollRestoration } from "react-router";
import { useConnection } from "wagmi";

import TerminalEditor from "../components/editor/TerminalEditor";
import TitleInput from "../components/editor/TitleInput";
import ActionButtons from "../components/execution/ActionButtons";
import ConfigureButton from "../components/execution/ConfigureButton";
import Footer from "../components/layout/Footer";
import Header from "../components/layout/Header";
import { SidePanel } from "../components/panel/SidePanel";
import SaveScriptButton from "../components/scripts/SaveScriptButton";
import ShareScriptButton from "../components/scripts/ShareScriptButton";
import { useTerminalScript } from "../hooks/useTerminalScript";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import { useWalletConnection } from "../hooks/useWalletConnection";
import { useTerminalStore } from "../stores/terminal-store";

function useIsSmallScreen(breakpoint = 768) {
  const [isSmall, setIsSmall] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener("change", handler);
    setIsSmall(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isSmall;
}

export default function Terminal() {
  const [maximizeGasLimit, setMaximizeGasLimit] = useState(false);

  const { address } = useWalletConnection();
  const { titleFromSession, scriptFromSession } = useTerminalScript();
  const { errors, script } = useTerminalStore();

  const { connector: activeConnector } = useConnection();
  const isSafe = activeConnector?.id === "safe";
  const safeConnectorInstance = isSafe ? activeConnector : undefined;

  const { executeScript, logs } = useTransactionExecutor(
    address,
    maximizeGasLimit,
    script,
    safeConnectorInstance,
  );

  const toggleMaximizeGasLimit = useCallback(
    () => setMaximizeGasLimit((v) => !v),
    [],
  );

  const isSmallScreen = useIsSmallScreen();

  return (
    <>
      <ScrollRestoration />
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Global Header */}
        <div className="shrink-0 w-full bg-evm-gray-900 border-b border-border px-6 py-4">
          <Header address={address} />
        </div>

        {/* Main Workspace */}
        <div
          className="flex-1 min-h-0 overflow-hidden flex"
          style={{ flexDirection: isSmallScreen ? "column" : "row" }}
        >
          {/* Editor panel */}
          <div
            className="flex flex-col overflow-hidden bg-background"
            style={{ flex: isSmallScreen ? "0 0 60%" : "0 0 70%" }}
          >
            {/* Top Toolbar */}
            <div className="px-4 py-3 shrink-0 bg-evm-gray-900/50">
              <div className="flex flex-col items-end">
                <div className="flex w-full">
                  <TitleInput />
                  <div className="flex-1" />
                  <div className="flex items-center gap-1">
                    <SaveScriptButton
                      title={titleFromSession}
                      script={scriptFromSession}
                    />
                    <ShareScriptButton
                      title={titleFromSession}
                      script={scriptFromSession}
                    />
                    <ConfigureButton
                      setMaximizeGasLimit={{ toggle: toggleMaximizeGasLimit }}
                      maximizeGasLimit={maximizeGasLimit}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0 px-4 pt-2 overflow-hidden animate-fade-in">
              <TerminalEditor />
            </div>

            {/* Action Buttons */}
            <div
              className="px-4 py-3 shrink-0 bg-evm-gray-900/50 animate-fade-in"
              style={{ animationDelay: "0.1s" }}
            >
              <ActionButtons onExecute={executeScript} />
            </div>
          </div>

          {/* Divider */}
          <div
            className={
              isSmallScreen ? "h-px w-full bg-border" : "w-px h-full bg-border"
            }
          />

          {/* Side panel */}
          <div
            className="flex flex-col overflow-hidden bg-evm-gray-900"
            style={{ flex: isSmallScreen ? "0 0 40%" : "0 0 30%" }}
          >
            <SidePanel logs={logs} errors={errors} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-evm-gray-900 border-t border-border">
          <Footer />
        </div>
      </div>
    </>
  );
}
