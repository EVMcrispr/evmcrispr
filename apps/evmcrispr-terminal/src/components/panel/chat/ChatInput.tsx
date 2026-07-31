import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import { cn, IconButton, Textarea } from "@repo/ui";
import { type ReactNode, useState } from "react";

import { useFocusOnTab } from "../../../hooks/useFocusOnTab";

/** ~6 rows of text plus padding. */
const MAX_HEIGHT_PX = 160;

export function ChatInput({
  isRunning,
  onSend,
  onStop,
  mobile = false,
  leading,
}: {
  isRunning: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  mobile?: boolean;
  leading?: ReactNode;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useFocusOnTab<HTMLTextAreaElement>("chat");

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const text = input.trim();
    if (!text || isRunning) return;
    setInput("");
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
    onSend(text);
  };

  return (
    <form
      className={cn(
        "flex shrink-0 gap-2 border-t border-foreground/10 px-2 py-2 pb-5",
        mobile &&
          "mobile-chat-composer items-end border-foreground/10 bg-background/95 px-3 pt-3 backdrop-blur",
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
          isRunning
            ? "Working..."
            : mobile
              ? "Describe what to do…"
              : "Ask about the script..."
        }
        disabled={isRunning}
        className={cn(
          "flex-1 overflow-y-auto",
          // h-12 pins the rest height to exactly match the 48px buttons
          // beside it (auto height would be 50px: 24px line + py-3 + border);
          // the autogrow inline style still wins once typing wraps.
          mobile &&
            "h-12 min-h-12 resize-none border-foreground/15 bg-foreground/[0.04] px-4 py-2.5 font-sans text-base shadow-none",
        )}
        style={{ maxHeight: MAX_HEIGHT_PX }}
      />
      {isRunning ? (
        <IconButton
          type="button"
          aria-label="Stop"
          variant="outline"
          size={mobile ? "lg" : "md"}
          onClick={onStop}
          className={cn("self-end", mobile && "min-h-12 min-w-12")}
        >
          <StopIcon className="w-5 h-5" />
        </IconButton>
      ) : (
        <IconButton
          type="submit"
          aria-label="Send"
          size={mobile ? "lg" : "md"}
          disabled={!input.trim()}
          className={cn("self-end", mobile && "min-h-12 min-w-12")}
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </IconButton>
      )}
    </form>
  );
}
