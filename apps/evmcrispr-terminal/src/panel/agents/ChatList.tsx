import { EmptyState, IconButton, Row } from "@repo/ui";
import { Trash2 } from "@repo/ui/icons";
import { chatByline, type ListedChat } from "./useChatList";

/** Every chat with the assistant, the open one marked: the same list in
 *  the popover on a desktop and in the sheet on a phone. */
export function ChatList({
  chats,
  activeId,
  disabled,
  onOpenChat,
  onDeleteChat,
}: {
  chats: ListedChat[];
  activeId: string;
  disabled?: boolean;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}) {
  if (chats.length === 0) return <EmptyState>No previous chats</EmptyState>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {chats.map((chat) => (
        <Row
          key={chat.id}
          as="li"
          title={chat.title || "Untitled chat"}
          meta={chatByline(chat)}
          active={chat.id === activeId}
          disabled={disabled}
          onClick={() => onOpenChat(chat.id)}
          actions={
            <IconButton
              type="button"
              aria-label="Delete chat"
              variant="destructive"
              size="sm"
              onClick={() => onDeleteChat(chat.id)}
            >
              <Trash2 aria-hidden />
            </IconButton>
          }
        />
      ))}
    </ul>
  );
}
