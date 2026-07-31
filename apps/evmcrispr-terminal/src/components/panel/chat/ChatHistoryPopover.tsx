import { ClockIcon, TrashIcon } from "@heroicons/react/24/solid";
import { cn, IconButton, Popover } from "@repo/ui";
import { useState } from "react";

import { type ChatMeta, listChats } from "../../../ai/chat-store";
import { useTerminalStore } from "../../../stores/terminal-store";

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ChatHistoryPopover({
  activeId,
  onOpenChat,
  onDeleteChat,
  disabled,
}: {
  activeId: string;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  // Chats belong to the current script (script 1-N chats).
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setChats(listChats(currentScriptId ?? undefined));
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <IconButton
          type="button"
          aria-label="Chat history"
          variant="ghost"
          size="sm"
        >
          <ClockIcon className="w-4 h-4" />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        className="w-72 p-1 max-h-80 overflow-y-auto"
      >
        {chats.length === 0 ? (
          <p className="px-3 py-2 text-sm text-foreground/50">
            No previous chats
          </p>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-1 rounded-none",
                chat.id === activeId
                  ? "bg-foreground/10"
                  : "hover:bg-foreground/5",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onOpenChat(chat.id);
                  setOpen(false);
                }}
                className="flex-1 min-w-0 px-2 py-1.5 text-left disabled:cursor-not-allowed"
              >
                <span className="block truncate text-sm text-foreground">
                  {chat.title || "Untitled chat"}
                </span>
                <span className="block text-xs text-foreground/50">
                  {relativeDate(chat.updatedAt)}
                </span>
              </button>
              <IconButton
                type="button"
                aria-label="Delete chat"
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={() => {
                  onDeleteChat(chat.id);
                  setChats(listChats(currentScriptId ?? undefined));
                }}
              >
                <TrashIcon className="w-4 h-4" />
              </IconButton>
            </div>
          ))
        )}
      </Popover.Content>
    </Popover>
  );
}
