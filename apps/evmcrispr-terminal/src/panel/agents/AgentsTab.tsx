import { fetchNexusBalance, logoutNexus } from "@evmcrispr/ai";
import { IconButton, Notice } from "@repo/ui";
import { MessagesSquare } from "@repo/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../app/AppContext";
import { useMaybeSpace } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { useAssistant } from "../../assistant/AssistantProvider";
import { spaceFromProgram } from "../../space/derive";
import { ChatHeader } from "./ChatHeader";
import { ChatHistorySheet } from "./ChatHistorySheet";
import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSettings } from "./ChatSettings";
import type { CardActions } from "./ToolCards";

/** The Agents tab. In this piece the only agent is the built-in Dappnode
 *  Nexus assistant, so the tab opens straight into its chat; the list of
 *  agents appears when there is a second one. The chat belongs to the
 *  browser: it stays as it is when the space on screen changes. */
export function AgentsTab({
  mobile = false,
  onOpenScript,
  onOpenReview,
  onOpenTimeline,
  settingsOpen,
  onSettingsOpenChange,
}: {
  mobile?: boolean;
  onOpenScript?: () => void;
  onOpenReview?: () => void;
  /** Mobile: bring the Space surface forward. */
  onOpenTimeline?: () => void;
  /** Controlled settings visibility (mobile: the menu opens settings). */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
} = {}) {
  const {
    hasKey,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
    send,
    stop,
    conversationId,
    newChat,
    openChat,
    deleteChat,
    regenerate,
    busyElsewhere,
  } = useAssistant();
  const { spaces } = useApp();
  const space = useMaybeSpace();
  const navigate = useNavigate();

  const cards = useMemo<CardActions>(
    () => ({
      onOpenScript,
      onReview: onOpenReview,
      onSeeInTimeline(id) {
        setUi({ activeTab: "space", spaceView: "timeline" });
        onOpenTimeline?.();
        // The change may have landed in a space that is not on screen.
        const listed = spaces.index.getState().some((meta) => meta.id === id);
        if (id && listed && id !== spaces.onScreen.getState())
          navigate(`/${id}`);
      },
      // What a program wrote is what a review is for: the new space
      // starts unreviewed.
      async onOpenInNewSpace(code) {
        navigate(`/${await spaceFromProgram(spaces, code)}`);
      },
      // Like any load: recorded, undoable, and judged by where it lands.
      onLoadInEditor: space
        ? (code) => {
            space.load(code, "load");
            onOpenScript?.();
          }
        : undefined,
    }),
    [onOpenScript, onOpenReview, onOpenTimeline, spaces, space, navigate],
  );
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const showSettings = settingsOpen ?? internalSettingsOpen;
  const setShowSettings = onSettingsOpenChange ?? setInternalSettingsOpen;

  // Refetches after each completed run (runs cost credits): re-enabling the
  // query when isRunning drops back to false refreshes the stale balance.
  const { data: balanceCents } = useQuery({
    queryKey: ["nexus-balance"],
    queryFn: fetchNexusBalance,
    enabled: hasKey && !isRunning,
  });

  if (!hasKey || showSettings)
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ChatSettings
            onSave={(key) => {
              setApiKey(key);
              setShowSettings(false);
            }}
            onBack={hasKey ? () => setShowSettings(false) : undefined}
            notice={
              error?.kind === "auth" || error?.kind === "balance"
                ? error.message
                : undefined
            }
            balanceCents={balanceCents}
            onDisconnect={
              hasKey
                ? () => {
                    void logoutNexus();
                    clearApiKey();
                    setShowSettings(false);
                  }
                : undefined
            }
          />
        </div>
      </div>
    );

  // On mobile the Nexus chat header would be a third chrome bar — chat
  // switching lives behind one composer button (a bottom sheet with a
  // pinned "New chat" row), and settings/balance move to the workspace
  // menu and top bar.
  const composerLeading = mobile ? (
    <IconButton
      type="button"
      aria-label="Previous chats"
      variant="neutral"
      size="md"
      onClick={() => setHistoryOpen(true)}
    >
      <MessagesSquare aria-hidden className="size-4" />
    </IconButton>
  ) : undefined;

  return (
    <div className="flex flex-col h-full">
      {!mobile && (
        <ChatHeader
          balanceCents={balanceCents}
          conversationId={conversationId}
          isRunning={isRunning}
          onNewChat={newChat}
          onOpenChat={openChat}
          onDeleteChat={deleteChat}
          onShowSettings={() => setShowSettings(true)}
        />
      )}
      <ChatMessageList
        items={items}
        isRunning={isRunning}
        error={error}
        onShowSettings={() => setShowSettings(true)}
        onRegenerate={regenerate}
        onSuggestion={send}
        cards={cards}
        chatId={conversationId}
        mobile={mobile}
      />
      {busyElsewhere && (
        <div className="shrink-0 px-2.5 pb-1.5">
          <Notice tone="info" layout="inline" live>
            Answering in another tab…
          </Notice>
        </div>
      )}
      <ChatInput
        isRunning={isRunning}
        onSend={send}
        onStop={stop}
        blocked={busyElsewhere ? "Answering in another tab…" : undefined}
        mobile={mobile}
        leading={composerLeading}
      />
      {mobile && (
        <ChatHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          activeId={conversationId}
          disabled={isRunning}
          onOpenChat={openChat}
          onDeleteChat={deleteChat}
          onNewChat={newChat}
        />
      )}
    </div>
  );
}
