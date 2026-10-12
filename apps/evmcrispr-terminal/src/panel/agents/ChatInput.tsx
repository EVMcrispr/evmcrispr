import { cn, IconButton, Textarea } from "@repo/ui";
import { Send, Square } from "@repo/ui/icons";
import { type ReactNode, useState } from "react";

import { useFocusOnTab } from "../../hooks/useFocusOnTab";

/** ~6 rows of text plus padding. */
const MAX_HEIGHT_PX = 160;

export function ChatInput({
  isRunning,
  onSend,
  onStop,
  mobile = false,
  leading,
  blocked,
}: {
  /** Why nothing can be sent right now, when something else is in the way. */
  blocked?: string;
  isRunning: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  mobile?: boolean;
  leading?: ReactNode;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useFocusOnTab<HTMLTextAreaElement>("agents");

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const text = input.trim();
    if (!text || isRunning || blocked) return;
    setInput("");
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
    onSend(text);
  };

  return (
    <form
      className={cn(
        "flex shrink-0 items-end gap-2.5 border-t-2 border-line bg-surface-0 p-2.5 touch:px-3",
        // Its bottom padding follows the keyboard and the safe area.
        mobile && "mobile-chat-composer",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {leading}
      <Textarea
        ref={textareaRef}
        value={input}
        rows={1}
        onChange={(e) => {
          setInput(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (
            !mobile &&
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={
          blocked
            ? blocked
            : isRunning
              ? "Working..."
              : mobile
                ? "Describe what to do…"
                : "Ask about the script..."
        }
        disabled={isRunning || blocked !== undefined}
        variant="quiet"
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: MAX_HEIGHT_PX }}
      />
      {isRunning ? (
        <IconButton
          type="button"
          aria-label="Stop"
          variant="neutral"
          size="md"
          onClick={onStop}
        >
          <Square aria-hidden />
        </IconButton>
      ) : (
        <IconButton
          type="submit"
          aria-label="Send"
          variant="primary"
          size="md"
          disabled={!input.trim() || blocked !== undefined}
        >
          <Send aria-hidden className="size-4" />
        </IconButton>
      )}
    </form>
  );
}
