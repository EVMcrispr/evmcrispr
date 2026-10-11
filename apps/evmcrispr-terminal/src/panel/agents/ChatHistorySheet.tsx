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
      {/* It stays at the foot of the sheet, on a fade of the sheet's own
          surface, so a long list of chats goes under it, not beside it. */}
      <div className="pointer-events-none sticky -bottom-3 z-10 -mt-3 bg-linear-to-t from-surface-sheet via-surface-sheet via-65% to-transparent pt-10 pb-5">
        <Button
          type="button"
          // Starting one is what the sheet is most often opened for.
          variant="primary"
          className="pointer-events-auto w-full"
          disabled={disabled}
          onClick={() => {
            onNewChat();
            onOpenChange(false);
          }}
        >
          <Plus data-icon aria-hidden />
          New chat
        </Button>
      </div>
    </Overlay>
  );
}
