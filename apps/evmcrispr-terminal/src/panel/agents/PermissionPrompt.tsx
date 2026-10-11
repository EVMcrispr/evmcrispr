import { ShieldExclamationIcon } from "@heroicons/react/24/solid";
import { Button } from "@repo/ui";
import { useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";

/** What the assistant needs the user's word for, as a tool call left it. */
export type PermissionAsk = { what: "web" } | { what: "edit"; space: string };

/** The one place a permission is given: the user's click, here. The
 *  answer is kept with the open chat, in this browser's private store. */
export function PermissionPrompt({
  chatId,
  ask,
}: {
  chatId: string;
  ask: PermissionAsk;
}) {
  const { chats, spaces } = useApp();
  const permissions = useSyncExternalStore(chats.subscribe, () =>
    chats.getPermissions(chatId),
  );
  const index = useStore(spaces.index);
  const [later, setLater] = useState(false);

  // The space is named from the user's own list, never from the chat.
  const title =
    ask.what === "edit"
      ? index.find((meta) => meta.id === ask.space)?.title
      : undefined;
  const allowed =
    ask.what === "web"
      ? permissions?.webWithSpaces === true
      : permissions?.edit.includes(ask.space) === true;
  const declined =
    ask.what === "web" ? permissions?.webWithSpaces === false : later;
  const gone = !permissions || (ask.what === "edit" && title === undefined);

  const question =
    ask.what === "web"
      ? "Let the assistant use the web in this chat after reading your other spaces? Content from them could be sent out."
      : `Let the assistant edit “${title ?? "a space that is no longer here"}”? You are not looking at it.`;

  return (
    <article className="border border-evm-orange-300/50 bg-card/45 p-3">
      <div className="flex items-start gap-3">
        <ShieldExclamationIcon className="size-5 shrink-0 text-evm-orange-300" />
        <p className="min-w-0 flex-1 wrap-break-word font-sans text-sm text-foreground">
          {question}
        </p>
      </div>
      {allowed ? (
        <p className="mt-2 font-sans text-xs text-foreground/60">
          Allowed for this chat. Ask the assistant to go on.
        </p>
      ) : (
        !gone && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                chats.grant(
                  chatId,
                  ask.what === "web"
                    ? { webWithSpaces: true }
                    : { edit: ask.space },
                )
              }
            >
              Allow for this chat
            </Button>
            {declined ? (
              <span className="font-sans text-xs text-foreground/60">
                Not allowed.
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  ask.what === "web"
                    ? chats.grant(chatId, { webWithSpaces: false })
                    : setLater(true)
                }
              >
                Not now
              </Button>
            )}
          </div>
        )
      )}
    </article>
  );
}
