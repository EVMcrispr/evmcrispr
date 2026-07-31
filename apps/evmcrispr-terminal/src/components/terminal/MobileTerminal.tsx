import type { HoverRef } from "@evmcrispr/core";
import type { Action } from "@evmcrispr/sdk";
import { useEffect, useState } from "react";
import { useKeyboardInsets } from "../../hooks/useKeyboardInsets";
import type { TerminalEntryIntent } from "../../hooks/useTerminalScript";
import type { ExecutionPhase } from "../../hooks/useTransactionExecutor";
import type { useTransactionReview } from "../../hooks/useTransactionReview";
import { terminalStoreActions } from "../../stores/terminal-store";
import { MobileHeader } from "../mobile/MobileHeader";
import { MobileMenu } from "../mobile/MobileMenu";
import { ScriptContextBar } from "../mobile/ScriptContextBar";
import { ScriptSheet } from "../mobile/ScriptSheet";
import { TransactionReviewSheet } from "../mobile/TransactionReviewSheet";
import { ChatPanel } from "../panel/ChatPanel";
import {
  hasScriptLoadState,
  ScriptLoadState,
  type ScriptLoadStateProps,
} from "./ScriptLoadState";

type MobileTerminalProps = ScriptLoadStateProps & {
  currentScriptId: string | null;
  entryIntent: TerminalEntryIntent;
  sharedEncrypted: boolean;
  address: `0x${string}` | undefined;
  chainName: string | undefined;
  title: string;
  script: string;
  executingLine: number | null;
  logs: string[];
  errors: string[];
  executionPhase: ExecutionPhase;
  executed: { action: Action; result?: unknown }[];
  review: ReturnType<typeof useTransactionReview>;
  onConnect: () => void;
  onDisconnect: () => void;
  onExecute: () => Promise<boolean>;
  onCancel: () => void;
};

export function MobileTerminal(props: MobileTerminalProps) {
  const [surface, setSurface] = useState<"chat" | "script">(
    props.entryIntent === "recipient" ? "script" : "chat",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // "reference" jumps the menu straight to the EVML reference tab when the
  // user taps "Open in reference" in the script viewer's hover popover.
  const [menuInitialPage, setMenuInitialPage] = useState<"menu" | "reference">(
    "menu",
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const loading = hasScriptLoadState(props);

  // Keeps the shell glued to the visual viewport so the header stays put and
  // the composer rides above the keyboard — `.mobile-terminal` reads the vars.
  useKeyboardInsets(true);

  // The review dot signals an *unseen* update, not persistent state: it
  // appears when the simulation readied while the sheet was closed and
  // clears once the user opens it.
  const reviewReady = props.review.state.status === "ready";
  const [reviewSeen, setReviewSeen] = useState(false);
  useEffect(() => {
    if (!reviewReady) setReviewSeen(false);
    else if (reviewOpen) setReviewSeen(true);
  }, [reviewReady, reviewOpen]);
  const reviewUnseen = reviewReady && !reviewSeen;

  useEffect(() => {
    void props.currentScriptId;
    setSurface(props.entryIntent === "recipient" ? "script" : "chat");
  }, [props.currentScriptId, props.entryIntent]);

  // Desktop's TitleInput does this; the mobile title field writes the store
  // directly, so mirror the tab title here.
  useEffect(() => {
    document.title = props.title
      ? `${props.title} - EVMcrispr Terminal`
      : "EVMcrispr Terminal";
  }, [props.title]);

  // Activity now lives inside the review sheet — surface execution
  // progress and outcomes by (re)opening it.
  useEffect(() => {
    if (
      props.executionPhase === "awaiting-wallet" ||
      props.executionPhase === "success" ||
      props.executionPhase === "error" ||
      props.executionPhase === "cancelled"
    ) {
      setReviewOpen(true);
    }
  }, [props.executionPhase]);

  const openReview = () => {
    setReviewOpen(true);
    if (!props.review.canExecute) void props.review.prepare();
  };

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) setMenuInitialPage("menu");
  };

  const handleOpenDocs = (ref: HoverRef) => {
    terminalStoreActions("docsRequest", { ...ref, ts: Date.now() });
    setMenuInitialPage("reference");
    setMenuOpen(true);
  };

  const execute = async () => {
    if (!props.review.canExecute) return;
    await props.onExecute();
  };

  // No `h-dvh` on the root below: `.mobile-terminal` owns the height so it can
  // track the visual viewport (dvh does not shrink for the keyboard on iOS).
  return (
    <div className="mobile-terminal flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <MobileHeader
        address={props.address}
        onConnect={props.onConnect}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {/* The script is the persistent subject of the session — keep its
          identity and state on screen while the user chats about it. */}
      {!loading && surface === "chat" && (
        <ScriptContextBar
          title={props.title}
          reviewState={props.review.state}
          reviewUnseen={reviewUnseen}
          onOpenScript={() => setSurface("script")}
          onOpenReview={openReview}
        />
      )}

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <ScriptLoadState {...props} />
        ) : surface === "script" ? (
          <ScriptSheet
            title={props.title}
            script={props.script}
            executingLine={props.executingLine}
            entryIntent={props.entryIntent}
            sharedEncrypted={props.sharedEncrypted}
            reviewState={props.review.state}
            onBackToChat={() => setSurface("chat")}
            onReview={openReview}
            onOpenDocs={handleOpenDocs}
          />
        ) : null}
        {/* The chat owns the conversation state (useChatAgent) — keep it
            mounted across surface switches or the thread and any in-flight
            run are lost. */}
        <div
          className={
            loading || surface !== "chat"
              ? "hidden"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          <ChatPanel
            mobile
            onOpenScript={() => setSurface("script")}
            onOpenReview={openReview}
            settingsOpen={chatSettingsOpen}
            onSettingsOpenChange={setChatSettingsOpen}
          />
        </div>
      </main>

      <MobileMenu
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        address={props.address}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onOpenChatSettings={() => {
          setMenuOpen(false);
          setSurface("chat");
          setChatSettingsOpen(true);
        }}
        initialPage={menuInitialPage}
      />

      <TransactionReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        state={props.review.state}
        actionCount={props.review.actionCount}
        chainName={props.chainName}
        address={props.address}
        executionPhase={props.executionPhase}
        canExecute={props.review.canExecute}
        logs={props.logs}
        errors={props.errors}
        executed={props.executed}
        onCancel={props.onCancel}
        onPrepare={() => void props.review.prepare()}
        onExecute={() => void execute()}
        onConnect={() => {
          // Two modal vaul roots at once wedge the body scroll lock, and
          // connecting resets the review state anyway — close this sheet
          // before the wallet drawer opens.
          setReviewOpen(false);
          props.onConnect();
        }}
      />
    </div>
  );
}
