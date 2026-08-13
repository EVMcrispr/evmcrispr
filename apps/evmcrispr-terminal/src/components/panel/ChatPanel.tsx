import { fetchNexusBalance, logoutNexus } from "@evmcrispr/ai";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";
import { IconButton, toast } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTerminalChatAgent } from "../../ai/useTerminalChatAgent";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatHistorySheet } from "./chat/ChatHistorySheet";
import { ChatInput } from "./chat/ChatInput";
import { ChatMessageList } from "./chat/ChatMessageList";
import { ChatSettings } from "./chat/ChatSettings";

export function ChatPanel({
  mobile = false,
  onOpenScript,
  onOpenReview,
  settingsOpen,
  onSettingsOpenChange,
}: {
  mobile?: boolean;
  onOpenScript?: () => void;
  onOpenReview?: () => void;
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
    errorKind,
    send,
    stop,
    conversationId,
    newChat,
    openChat,
    deleteChat,
    regenerate,
    undoRevision,
  } = useTerminalChatAgent();
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
              errorKind === "auth" || errorKind === "balance"
                ? error
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
      variant="outline"
      size="lg"
      className="min-h-12 min-w-12 self-end border-foreground/15 shadow-none"
      onClick={() => setHistoryOpen(true)}
    >
      <ChatBubbleLeftRightIcon className="size-5 text-foreground/70" />
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
        errorKind={errorKind}
        onShowSettings={() => setShowSettings(true)}
        onRegenerate={regenerate}
        onSuggestion={(text) => void send(text)}
        onOpenScript={onOpenScript}
        onReview={onOpenReview}
        onUndoRevision={(revisionId) => {
          const result = undoRevision(revisionId);
          if (!result.ok) toast.error(result.error);
          else toast.success("Script change undone");
        }}
        mobile={mobile}
      />
      <ChatInput
        isRunning={isRunning}
        onSend={(text) => void send(text)}
        onStop={stop}
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
