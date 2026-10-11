import { Cog6ToothIcon, PlusIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@repo/ui";

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
    <div className="flex shrink-0 items-center gap-2 border-b border-foreground/10 px-3 py-2 text-sm text-foreground/60">
      <img src="/dappnode-logo.svg" alt="" className="w-5 h-5" />
      <a
        href={NEXUS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground/80 hover:underline"
      >
        DappNode Nexus
      </a>
      {balanceCents != null && (
        <span className="ml-auto rounded-full bg-foreground/10 px-2.5 py-0.5 tabular-nums">
          €{(balanceCents / 100).toFixed(2)}
        </span>
      )}
      <div
        className={
          balanceCents != null
            ? "flex items-center"
            : "ml-auto flex items-center"
        }
      >
        <IconButton
          type="button"
          aria-label="New chat"
          variant="ghost"
          size="sm"
          disabled={isRunning}
          onClick={onNewChat}
        >
          <PlusIcon className="w-4 h-4" />
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
          variant="ghost"
          size="sm"
          onClick={onShowSettings}
        >
          <Cog6ToothIcon className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  );
}
