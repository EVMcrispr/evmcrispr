import { ClockIcon, TrashIcon } from "@heroicons/react/24/solid";
import { cn, IconButton, Popover } from "@repo/ui";
import { useState } from "react";
import { chatByline, useChatList } from "./useChatList";

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
  const chats = useChatList();

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        className="max-h-80 w-72 overflow-y-auto p-1"
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
                className="min-w-0 flex-1 px-2 py-1.5 text-left disabled:cursor-not-allowed"
              >
                <span className="block truncate text-sm text-foreground">
                  {chat.title || "Untitled chat"}
                </span>
                <span className="block text-xs text-foreground/50">
                  {chatByline(chat)}
                </span>
              </button>
              <IconButton
                type="button"
                aria-label="Delete chat"
                variant="ghost"
                size="sm"
                className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={() => onDeleteChat(chat.id)}
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
