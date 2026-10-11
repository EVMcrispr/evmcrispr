import { Badge, IconButton, PanelHeader } from "@repo/ui";
import { Plus, Settings } from "@repo/ui/icons";

import { ChatHistoryPopover } from "./ChatHistoryPopover";
import { NEXUS_URL } from "./ChatSettings";

export function ChatHeader({
  balanceCents,
  conversationId,
  isRunning,
  onNewChat,
  onOpenChat,
  onDeleteChat,
  onShowSettings,
}: {
  balanceCents?: number | null;
  conversationId: string;
  isRunning: boolean;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onShowSettings: () => void;
}) {
  return (
    <PanelHeader
      className="shrink-0"
      title={
        <span className="flex items-center gap-2">
          <img src="/dappnode-logo.svg" alt="" className="size-5" />
          <a
            href={NEXUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-fg underline-offset-2 hover:underline"
          >
            DappNode Nexus
          </a>
        </span>
      }
      actions={
        <>
          {balanceCents != null && (
            <Badge variant="count">€{(balanceCents / 100).toFixed(2)}</Badge>
          )}
          <IconButton
            type="button"
            aria-label="New chat"
            variant="quiet"
            size="sm"
            disabled={isRunning}
            onClick={onNewChat}
          >
            <Plus aria-hidden />
          </IconButton>
          <ChatHistoryPopover
            activeId={conversationId}
            onOpenChat={onOpenChat}
            onDeleteChat={onDeleteChat}
            disabled={isRunning}
          />
          <IconButton
            type="button"
            aria-label="Chat settings"
            variant="quiet"
            size="sm"
            onClick={onShowSettings}
          >
            <Settings aria-hidden />
          </IconButton>
        </>
      }
    />
  );
}
