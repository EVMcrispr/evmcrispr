import { Viewer } from "@evmcrispr/editor";
import { lazy, Suspense, useEffect, useState } from "react";
import { ScrollRestoration } from "react-router";
import { useConnection } from "wagmi";
import TitleInput from "../components/editor/TitleInput";
import ActionButtons from "../components/execution/ActionButtons";
import Footer from "../components/layout/Footer";
import Header from "../components/layout/Header";
import { SidePanel } from "../components/panel/SidePanel";
import NewScriptButton from "../components/scripts/NewScriptButton";
import ScriptNotFound from "../components/scripts/ScriptNotFound";
import ShareScriptButton from "../components/scripts/ShareScriptButton";
import { useAutoSave } from "../hooks/useAutoSave";
import { useTerminalScript } from "../hooks/useTerminalScript";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import { useViewMode } from "../hooks/useViewMode";
import { useWalletConnection } from "../hooks/useWalletConnection";
import { useTerminalStore } from "../stores/terminal-store";

// Code-split Monaco out of the mobile critical path. The editor module
// pulls in `monaco-editor` (~700 KB gzipped) which is wasted bytes for
// users who only want to read or execute a script.
const TerminalEditor = lazy(
  () => import("../components/editor/TerminalEditor"),
);

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
  const { address } = useWalletConnection();
  const { scriptNotFound, ipfsError, ipfsLoading, encryptedError } =
    useTerminalScript();
  useAutoSave();
  const script = useTerminalStore((s) => s.script);
  const title = useTerminalStore((s) => s.title);

  const { connector: activeConnector } = useConnection();
  const isSafe = activeConnector?.id === "safe";
  const safeConnectorInstance = isSafe ? activeConnector : undefined;

  const { executeScript, logs, errors, clearErrors } = useTransactionExecutor(
    address,
    script,
    safeConnectorInstance,
  );

  const isSmallScreen = useIsSmallScreen();
  const viewMode = useTerminalStore((s) => s.viewMode);
  const executingLine = useTerminalStore((s) => s.executingLine);
  const { setViewMode } = useViewMode();
  const isViewing = viewMode === "view";

  return (
    <>
      <ScrollRestoration />
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="shrink-0 w-full bg-evm-gray-900 px-6 py-6">
          <Header address={address} onDisconnect={clearErrors} />
        </div>

        <div
          className="flex-1 min-h-0 overflow-hidden flex pl-2 bg-evm-gray-900"
          style={{ flexDirection: isSmallScreen ? "column" : "row" }}
        >
          <div
            className="flex flex-col overflow-hidden bg-[#000] pb-3"
            style={{ flex: isSmallScreen ? "0 0 60%" : "0 0 70%" }}
          >
            {encryptedError ? (
              <ScriptNotFound variant={`encrypted-${encryptedError}`} />
            ) : scriptNotFound || ipfsError ? (
              <ScriptNotFound variant={ipfsError ? "ipfs" : "uuid"} />
            ) : ipfsLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 select-none animate-fade-in">
                <div className="w-8 h-8 border-2 border-evm-green-300/30 border-t-evm-green-300 rounded-full animate-spin" />
                <p className="text-evm-green-300 font-head text-sm tracking-wide">
                  Fetching DNA sequence from IPFS...
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 shrink-0">
                  <div className="flex w-full">
                    <TitleInput />
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <NewScriptButton />
                      <ShareScriptButton title={title} script={script} />
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 px-4 pt-2 overflow-hidden animate-fade-in">
                  {isViewing ? (
                    <Viewer
                      script={script}
                      executingLine={executingLine}
                      onActivateEdit={() => setViewMode("edit")}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-full text-foreground/40 text-sm">
                          Loading editor…
                        </div>
                      }
                    >
                      <TerminalEditor />
                    </Suspense>
                  )}
                </div>

                <div
                  className="px-4 py-3 shrink-0 animate-fade-in"
                  style={{ animationDelay: "0.1s" }}
                >
                  <ActionButtons onExecute={executeScript} />
                </div>
              </>
            )}
          </div>

          <div
            className={
              isSmallScreen ? "h-px w-full bg-border" : "w-px h-full bg-border"
            }
          />

          <div
            className="flex flex-col overflow-hidden bg-evm-gray-900"
            style={{ flex: isSmallScreen ? "0 0 40%" : "0 0 30%" }}
          >
            <SidePanel logs={logs} errors={errors} />
          </div>
        </div>

        <div className="shrink-0 bg-evm-gray-900">
          <Footer />
        </div>
      </div>
    </>
  );
}
