import { XMarkIcon } from "@heroicons/react/24/outline";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/solid";
import { Button, cn, Drawer, IconButton } from "@repo/ui";
import { useEffect, useState } from "react";

import { type ChatMeta, listChats } from "../../../ai/chat-store";
import { useTerminalStore } from "../../../stores/terminal-store";
import { relativeDate } from "./ChatHistoryPopover";

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
  const [chats, setChats] = useState<ChatMeta[]>([]);
  // Chats belong to the current script (script 1-N chats).
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);

  // The sheet is opened programmatically (the composer button), so the
  // list must refresh on the `open` prop — vaul's onOpenChange only fires
  // for internal dismissals.
  useEffect(() => {
    if (open) setChats(listChats(currentScriptId ?? undefined));
  }, [open, currentScriptId]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" modal>
      <Drawer.Content
        side="bottom"
        className="max-h-[70dvh] border-foreground/15 bg-[#0b0d0c]"
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-foreground/25" />
        <Drawer.Header className="border-foreground/10">
          <div>
            <Drawer.Title className="font-sans text-lg">Chats</Drawer.Title>
            <Drawer.Description className="sr-only">
              Start a new chat or reopen a previous one.
            </Drawer.Description>
          </div>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              aria-label="Close chats"
              variant="ghost"
              size="lg"
              className="min-h-11 min-w-11"
            >
              <XMarkIcon className="size-5" />
            </IconButton>
          </Drawer.Close>
        </Drawer.Header>

        <div className="shrink-0 px-4 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-start gap-3 px-2 font-sans text-xs shadow-none"
            disabled={disabled}
            onClick={() => {
              onNewChat();
              onOpenChange(false);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New chat
          </Button>
        </div>

        <div className="relative min-h-0">
          {/* The sheet is max-h sized (height stays `auto`), so percentage
              heights don't resolve in here — cap the scroller in dvh
              directly (70dvh minus ~9.5rem of handle/header/New chat) so
              short lists keep the sheet compact and long ones scroll.
              Padding matches the fade heights: at rest the gradients sit
              over padding only; rows slide under them once scrolled. */}
          <div className="max-h-[calc(70dvh-9.5rem)] overflow-y-auto px-4 pb-10 pt-3">
            <div>
              {chats.length === 0 ? (
                <p className="px-2 py-3 font-sans text-sm text-muted-foreground">
                  No previous chats
                </p>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 border-b border-foreground/10 py-1.5 pl-3 pr-1",
                      chat.id === activeId &&
                        "border-l-2 border-l-primary bg-foreground/4 pl-2.5",
                    )}
                    onClick={() => {
                      if (disabled) return;
                      onOpenChat(chat.id);
                      onOpenChange(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm text-foreground">
                        {chat.title || "Untitled chat"}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground">
                        {relativeDate(chat.updatedAt)}
                      </p>
                    </div>
                    <IconButton
                      aria-label="Delete chat"
                      variant="ghost"
                      size="sm"
                      className="min-h-9 min-w-9 shrink-0 text-foreground/45"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                        setChats(listChats(currentScriptId ?? undefined));
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Fades hint that the list scrolls under the pinned New chat
              row; they match the drawer background so they vanish over
              empty space. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-linear-to-b from-[#0b0d0c] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-[#0b0d0c] to-transparent" />
        </div>
      </Drawer.Content>
    </Drawer>
  );
}
