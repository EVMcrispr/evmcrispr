import { Button, Overlay } from "@repo/ui";
import { Plus } from "@repo/ui/icons";
import { ChatList } from "./ChatList";
import { useChatList } from "./useChatList";

export function ChatHistorySheet({
  open,
  onOpenChange,
  activeId,
  disabled,
  onOpenChat,
  onDeleteChat,
  onNewChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string;
  disabled?: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: () => void;
}) {
  const chats = useChatList();
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      sheet
      title="Chats"
      description="Start a new chat or reopen a previous one."
      closeLabel="Close chats"
    >
      <Button
        type="button"
        variant="neutral"
        className="w-full"
        disabled={disabled}
        onClick={() => {
          onNewChat();
          onOpenChange(false);
        }}
      >
        <Plus data-icon aria-hidden />
        New chat
      </Button>
      <ChatList
        chats={chats}
        activeId={activeId}
        disabled={disabled}
        onOpenChat={(id) => {
          onOpenChat(id);
          onOpenChange(false);
        }}
        onDeleteChat={onDeleteChat}
      />
    </Overlay>
  );
}
