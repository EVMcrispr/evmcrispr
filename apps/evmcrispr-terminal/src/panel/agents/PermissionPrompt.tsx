import { Button, Card } from "@repo/ui";
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
    <Card as="article" tone="warning">
      <Card.Header title="The assistant asks" />
      <Card.Body>
        <p className="m-0 wrap-break-word text-fg">{question}</p>
        {allowed && (
          <p className="m-0 text-caption text-fg-faint">
            Allowed for this chat. Ask the assistant to go on.
          </p>
        )}
      </Card.Body>
      {!allowed && !gone && (
        <Card.Footer>
          {declined ? (
            <span className="font-sans text-caption text-fg-faint">
              Not allowed.
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="quiet"
              onClick={() =>
                ask.what === "web"
                  ? chats.grant(chatId, { webWithSpaces: false })
                  : setLater(true)
              }
            >
              Not now
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="neutral"
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
        </Card.Footer>
      )}
    </Card>
  );
}
