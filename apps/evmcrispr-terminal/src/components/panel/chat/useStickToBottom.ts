import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 40;

/**
 * Auto-scroll a list only while the user is already at the bottom, so
 * scrolling up to read is never fought by the stream. `content` should change
 * identity whenever the list may have grown.
 */
export function useStickToBottom(content: unknown, isRunning: boolean) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    pinnedRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setIsAtBottom(true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content/isRunning are change signals, not effect inputs
  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [content, isRunning, scrollToBottom]);

  return { listRef, onScroll, isAtBottom, scrollToBottom };
}
