import { type RefObject, useEffect, useRef, useState } from "react";

/** How far the content is dragged before it counts as a pull. */
const SLACK = 24;
/** How far it follows the finger, at most. */
const REACH = 56;
/** How long the pull is held before it loads. */
export const HOLD = 200;
/** A wheel that stops this long has let go. */
const WHEEL_GAP = 220;

/**
 * Pulling a list down past its top, and holding it there for a moment,
 * loads what lies before it: with a finger, or with the wheel kept
 * turning upwards. Letting go earlier does nothing.
 *
 * Returns how far the content is pulled (to draw it following) and
 * whether the hold is counting.
 */
export function usePullToLoad(
  list: RefObject<HTMLElement | null>,
  enabled: boolean,
  onLoad: () => void,
) {
  const [pull, setPull] = useState(0);
  const [holding, setHolding] = useState(false);
  const load = useRef(onLoad);
  load.current = onLoad;

  useEffect(() => {
    const el = list.current;
    if (!el || !enabled) return;
    let startY: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wheelGap: ReturnType<typeof setTimeout> | undefined;

    const release = () => {
      clearTimeout(timer);
      clearTimeout(wheelGap);
      timer = undefined;
      startY = null;
      setPull(0);
      setHolding(false);
    };
    const hold = () => {
      if (timer) return;
      setHolding(true);
      timer = setTimeout(() => {
        release();
        load.current();
      }, HOLD);
    };

    const touchStart = (event: TouchEvent) => {
      startY = el.scrollTop <= 0 ? event.touches[0].clientY : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (startY === null) return;
      const by = event.touches[0].clientY - startY;
      if (by < SLACK || el.scrollTop > 0) {
        if (timer) release();
        else setPull(0);
        // Still the same touch: it may come back down.
        startY = event.touches[0].clientY - Math.max(0, by);
        return;
      }
      setPull(Math.min(REACH, (by - SLACK) / 2));
      hold();
    };
    const wheel = (event: WheelEvent) => {
      if (el.scrollTop > 0 || event.deltaY >= 0) {
        if (timer) release();
        return;
      }
      setPull(REACH / 2);
      hold();
      clearTimeout(wheelGap);
      wheelGap = setTimeout(release, WHEEL_GAP);
    };

    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: true });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      release();
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("wheel", wheel);
    };
  }, [list, enabled]);

  return { pull, holding };
}
