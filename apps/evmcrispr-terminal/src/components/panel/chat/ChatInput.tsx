import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";
import { IconButton, Textarea } from "@repo/ui";
import { useRef, useState } from "react";

/** ~6 rows of text plus padding. */
const MAX_HEIGHT_PX = 160;

export function ChatInput({
  isRunning,
  onSend,
  onStop,
}: {
  isRunning: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      className="flex gap-2 px-2 py-2 pb-5 border-t border-foreground/10 shrink-0"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={textareaRef}
        value={input}
        rows={1}
        onChange={(e) => {
          setInput(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={isRunning ? "Working..." : "Ask about the script..."}
        disabled={isRunning}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: MAX_HEIGHT_PX }}
      />
      {isRunning ? (
        <IconButton
          type="button"
          aria-label="Stop"
          variant="outline"
          size="md"
          onClick={onStop}
          className="self-end"
        >
          <StopIcon className="w-5 h-5" />
        </IconButton>
      ) : (
        <IconButton
          type="submit"
          aria-label="Send"
          size="md"
          disabled={!input.trim()}
          className="self-end"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </IconButton>
      )}
    </form>
  );
}
