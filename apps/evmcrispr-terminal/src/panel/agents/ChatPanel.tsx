import { fetchNexusBalance, logoutNexus } from "@evmcrispr/ai";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTerminalChatAgent } from "../../ai/useTerminalChatAgent";
import { ChatHeader } from "./ChatHeader";
import { ChatHistorySheet } from "./ChatHistorySheet";
import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSettings } from "./ChatSettings";

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
    send,
    stop,
    conversationId,
    newChat,
    openChat,
    deleteChat,
    regenerate,
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
        onShowSettings={() => setShowSettings(true)}
        onRegenerate={regenerate}
        onSuggestion={(text) => void send(text)}
        onOpenScript={onOpenScript}
        onReview={onOpenReview}
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
