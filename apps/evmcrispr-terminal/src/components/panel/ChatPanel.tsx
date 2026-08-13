import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchNexusBalance, logoutNexus } from "../../ai/nexus-auth";
import { useChatAgent } from "../../ai/useChatAgent";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatInput } from "./chat/ChatInput";
import { ChatMessageList } from "./chat/ChatMessageList";
import { ChatSettings } from "./chat/ChatSettings";

export function ChatPanel() {
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
  } = useChatAgent();
  const [showSettings, setShowSettings] = useState(false);

  // Refetches after each completed run (runs cost credits): re-enabling the
  // query when isRunning drops back to false refreshes the stale balance.
  const { data: balanceCents } = useQuery({
    queryKey: ["nexus-balance"],
    queryFn: fetchNexusBalance,
    enabled: hasKey && !isRunning,
  });

  if (!hasKey || showSettings)
    return (
      <ChatSettings
        onSave={(key) => {
          setApiKey(key);
          setShowSettings(false);
        }}
        onBack={hasKey ? () => setShowSettings(false) : undefined}
        balanceCents={balanceCents}
        // A run that died on a dead key lands the user here with the key
        // already gone; say why, next to the login that fixes it.
        notice={!hasKey && error?.kind === "auth" ? error.message : undefined}
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
    );

  return (
    <div className="flex flex-col h-full">
      <ChatHeader
        balanceCents={balanceCents}
        conversationId={conversationId}
        isRunning={isRunning}
        onNewChat={newChat}
        onOpenChat={openChat}
        onDeleteChat={deleteChat}
        onShowSettings={() => setShowSettings(true)}
      />
      <ChatMessageList
        items={items}
        isRunning={isRunning}
        error={error}
        onShowSettings={() => setShowSettings(true)}
        onRegenerate={regenerate}
        onSuggestion={(text) => void send(text)}
      />
      <ChatInput
        isRunning={isRunning}
        onSend={(text) => void send(text)}
        onStop={stop}
      />
    </div>
  );
}
