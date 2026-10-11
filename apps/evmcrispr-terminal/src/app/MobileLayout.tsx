import type { HoverRef } from "@evmcrispr/core";
import { useEffect, useState } from "react";
import { ScriptIO } from "../components/execution/ScriptIO";
import { MobileHeader } from "../components/mobile/MobileHeader";
import { MobileMenu } from "../components/mobile/MobileMenu";
import { ScriptContextBar } from "../components/mobile/ScriptContextBar";
import { ScriptSheet } from "../components/mobile/ScriptSheet";
import { TransactionReviewSheet } from "../components/mobile/TransactionReviewSheet";
import { ChatPanel } from "../components/panel/ChatPanel";
import { ScriptLoadState } from "../components/terminal/ScriptLoadState";
import { useKeyboardInsets } from "../hooks/useKeyboardInsets";
import { useWallet } from "../wallet/WalletContext";
import { useDocumentTitle } from "./DesktopLayout";
import { useLegacy } from "./legacy-execution";
import { useSpace } from "./SpaceContext";
import { StorageNotice } from "./StorageNotice";
import { setUi, useUi } from "./ui-store";
import type { SpaceRoute } from "./useSpaceRoute";

type Ready = Extract<SpaceRoute, { status: "ready" }>;
type MenuPage = "menu" | "reference";

/** The mobile screen. The header and the workspace menu are there
 *  whatever the address resolves to; the rest needs a space. */
export function MobileLayout({ route }: { route: SpaceRoute }) {
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPage, setMenuPage] = useState<MenuPage>("menu");
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  useKeyboardInsets(true);
  useDocumentTitle();

  const openMenu = (page: MenuPage) => {
    setMenuPage(page);
    setMenuOpen(true);
  };

  return (
    <div className="mobile-terminal flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <StorageNotice />
      <MobileHeader
        address={wallet.address}
        onConnect={wallet.connectWallet}
        onOpenMenu={() => openMenu("menu")}
      />

      {route.status === "ready" ? (
        <MobileSpace
          route={route}
          chatSettingsOpen={chatSettingsOpen}
          onChatSettingsOpenChange={setChatSettingsOpen}
          onOpenReference={() => openMenu("reference")}
        />
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScriptLoadState route={route} />
        </main>
      )}

      <MobileMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) setMenuPage("menu");
        }}
        onOpenChatSettings={() => {
          setMenuOpen(false);
          setChatSettingsOpen(true);
        }}
        initialPage={menuPage}
      />
    </div>
  );
}

/** Everything on the mobile screen that needs the space on screen. */
function MobileSpace({
  route,
  chatSettingsOpen,
  onChatSettingsOpenChange,
  onOpenReference,
}: {
  route: Ready;
  chatSettingsOpen: boolean;
  onChatSettingsOpenChange: (open: boolean) => void;
  onOpenReference: () => void;
}) {
  const space = useSpace();
  const wallet = useWallet();
  const { execution, review, input, setInput } = useLegacy();
  const isLoading = useUi((s) => s.isLoading);
  const [surface, setSurface] = useState<"chat" | "script">(
    route.intent === "recipient" ? "script" : "chat",
  );
  const [reviewOpen, setReviewOpen] = useState(false);

  // Flag a ready review until the user has seen it. A review that finishes
  // with the sheet open counts as seen; one that goes stale resets the flag.
  const reviewReady = review.state.status === "ready";
  const [reviewSeen, setReviewSeen] = useState(false);
  useEffect(() => {
    if (!reviewReady) setReviewSeen(false);
    else if (reviewOpen) setReviewSeen(true);
  }, [reviewReady, reviewOpen]);

  // Re-pick the surface on every navigation: a share link lands on the
  // script, anything else on the chat.
  useEffect(() => {
    void space.id;
    setSurface(route.intent === "recipient" ? "script" : "chat");
  }, [space.id, route.intent]);

  // The chat's settings live on the chat surface.
  useEffect(() => {
    if (chatSettingsOpen) setSurface("chat");
  }, [chatSettingsOpen]);

  const phase = execution.phase;
  useEffect(() => {
    if (phase !== "idle" && phase !== "preparing" && phase !== "running")
      setReviewOpen(true);
  }, [phase]);

  const openReview = () => {
    setReviewOpen(true);
    if (!review.canExecute) void review.prepare();
  };

  const openDocs = (ref: HoverRef) => {
    setUi({ docsRequest: { ...ref, ts: Date.now() } });
    onOpenReference();
  };

  return (
    <>
      {/* The script is the persistent subject of the session — keep its
          identity and state on screen while the user chats about it. */}
      {surface === "chat" && (
        <ScriptContextBar
          reviewState={review.state}
          reviewUnseen={reviewReady && !reviewSeen}
          onOpenScript={() => setSurface("script")}
          onOpenReview={openReview}
        />
      )}

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {surface === "script" && (
          <ScriptSheet
            entryIntent={route.intent}
            sharedEncrypted={route.sharedEncrypted}
            reviewState={review.state}
            onBackToChat={() => setSurface("chat")}
            onReview={openReview}
            onOpenDocs={openDocs}
          />
        )}
        {/* The chat owns the conversation state (useChatAgent) — keep it
            mounted across surface switches or the thread and any in-flight
            run are lost. */}
        <div
          className={
            surface !== "chat" ? "hidden" : "flex min-h-0 flex-1 flex-col"
          }
        >
          <ChatPanel
            mobile
            onOpenScript={() => setSurface("script")}
            onOpenReview={openReview}
            settingsOpen={chatSettingsOpen}
            onSettingsOpenChange={onChatSettingsOpenChange}
          />
        </div>
      </main>

      <TransactionReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        state={review.state}
        actionCount={review.actionCount}
        chainName={wallet.chainName}
        address={wallet.address}
        executionPhase={phase}
        canExecute={review.canExecute}
        logs={execution.logs}
        entries={execution.entries}
        followingBoxes={execution.followingBoxes}
        ioControl={
          <ScriptIO
            key={space.id}
            input={input}
            disabled={isLoading}
            onChange={setInput}
            output={execution.output}
          />
        }
        errors={execution.errors}
        executed={execution.executed}
        onCancel={execution.cancelExecution}
        onPrepare={() => void review.prepare()}
        onExecute={() => void execution.executeScript()}
        onConnect={() => {
          setReviewOpen(false);
          wallet.connectWallet();
        }}
      />
    </>
  );
}
