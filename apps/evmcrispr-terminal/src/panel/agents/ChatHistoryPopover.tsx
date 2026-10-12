import { IconButton, Popover } from "@repo/ui";
import { History } from "@repo/ui/icons";
import { useState } from "react";
import { ChatList } from "./ChatList";
import { useChatList } from "./useChatList";

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
  // Read here, not in the list: the popover is always mounted, and the
  // chat it belongs to is drawn again whenever the list of chats changes.
  const chats = useChatList();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <IconButton
            type="button"
            aria-label="Chat history"
            variant="quiet"
            size="sm"
          />
        }
      >
        <History aria-hidden />
      </Popover.Trigger>
      <Popover.Content
        align="end"
        className="max-h-80 w-80 overflow-y-auto p-2.5"
      >
        <ChatList
          chats={chats}
          activeId={activeId}
          disabled={disabled}
          onOpenChat={(id) => {
            onOpenChat(id);
            setOpen(false);
          }}
          onDeleteChat={onDeleteChat}
        />
      </Popover.Content>
    </Popover>
  );
}
