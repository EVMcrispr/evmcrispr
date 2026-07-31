import { ScrollRestoration } from "react-router";
import { DesktopTerminal } from "../components/terminal/DesktopTerminal";
import { MobileTerminal } from "../components/terminal/MobileTerminal";
import { hasScriptLoadState } from "../components/terminal/ScriptLoadState";
import SelectWalletModal from "../components/wallet/SelectWalletModal";
import { useAutoSave } from "../hooks/useAutoSave";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { useTerminalScript } from "../hooks/useTerminalScript";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import { useTransactionReview } from "../hooks/useTransactionReview";
import { useViewMode } from "../hooks/useViewMode";
import { useWalletConnection } from "../hooks/useWalletConnection";
import { useTerminalStore } from "../stores/terminal-store";

export default function Terminal() {
  const scriptState = useTerminalScript();
  useAutoSave();
  const isSmallScreen = useSmallScreen();
  const wallet = useWalletConnection();
  const currentScriptId = useTerminalStore((state) => state.currentScriptId);
  const script = useTerminalStore((s) => s.script);
  const title = useTerminalStore((s) => s.title);
  const viewMode = useTerminalStore((s) => s.viewMode);
  const executingLine = useTerminalStore((s) => s.executingLine);
  const { setViewMode } = useViewMode();
  const execution = useTransactionExecutor(
    wallet.address,
    script,
    wallet.safeConnectorInstance,
    { openConsoleOnExecute: !isSmallScreen },
  );
  // Share-link recipients land on a read-only script view — validate for
  // them automatically so the review status is meaningful without a tap.
  const review = useTransactionReview(script, wallet.address, {
    autoValidate:
      isSmallScreen &&
      scriptState.entryIntent === "recipient" &&
      !hasScriptLoadState(scriptState),
  });

  return (
    <>
      <ScrollRestoration />
      {isSmallScreen ? (
        <MobileTerminal
          {...scriptState}
          currentScriptId={currentScriptId}
          address={wallet.address}
          chainName={wallet.chainName}
          title={title}
          script={script}
          executingLine={executingLine}
          logs={execution.logs}
          errors={execution.errors}
          executionPhase={execution.phase}
          executed={execution.executed}
          review={review}
          onConnect={wallet.connectWallet}
          onDisconnect={() => {
            execution.clearErrors();
            wallet.disconnect();
          }}
          onExecute={execution.executeScript}
          onCancel={execution.cancelExecution}
        />
      ) : (
        <DesktopTerminal
          {...scriptState}
          address={wallet.address}
          title={title}
          script={script}
          viewMode={viewMode}
          executingLine={executingLine}
          logs={execution.logs}
          errors={execution.errors}
          onActivateEdit={() => setViewMode("edit")}
          onExecute={() => void execution.executeScript()}
          onCancel={execution.cancelExecution}
          onDisconnect={execution.clearErrors}
        />
      )}
      {/* Desktop connects through Header's own modal — this one only serves
          the mobile flow (wallet.connectWallet). */}
      {isSmallScreen && (
        <SelectWalletModal
          isOpen={wallet.isWalletModalOpen}
          onClose={wallet.closeWalletModal}
          mobile
        />
      )}
    </>
  );
}
