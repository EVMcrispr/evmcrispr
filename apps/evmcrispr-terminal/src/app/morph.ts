import { flushSync } from "react-dom";

/** The name the script carries from one phone view to the next: the
 *  space's box over the chat, the page that leads the timeline, the
 *  script opened. One of them is on screen at a time. */
export const SCRIPT_MORPH = "script-page";

/** The name of the space, which travels by itself: it is the one thing
 *  that is the same in every form the box takes. */
export const TITLE_MORPH = "space-title";

/** How long a change may take to show what it leads to. */
const PATIENCE = 600;

/** Changes the view so that what carries a transition name becomes what
 *  carries it afterwards, where the browser can do that. Only for a
 *  change the user asked for with a tap, never from an effect.
 *  `shown` is for a change that is not all there at once (a space that
 *  is still loading): the transition waits, a moment, for it to say so.
 *  `kind` names the transition for the stylesheet, while it lasts. */
export function morph(
  change: () => void,
  shown?: () => boolean,
  kind?: "closing" | "panel-forward" | "panel-back",
) {
  if (!document.startViewTransition) {
    change();
    return;
  }
  const root = document.documentElement;
  if (kind) root.dataset.morph = kind;
  const transition = document.startViewTransition(async () => {
    flushSync(change);
    if (!shown) return;
    const start = performance.now();
    while (!shown() && performance.now() - start < PATIENCE)
      await new Promise((next) => setTimeout(next, 16));
  });
  if (kind)
    void transition.finished.finally(() => {
      if (root.dataset.morph === kind) delete root.dataset.morph;
    });
}

/** The classes of what a space pushes away as its row opens over the
 *  list: what stands above it leaves upwards, what stands below it
 *  downwards, each as far as the row's own edge travels. */
export const DISPLACED = { above: "displaced-up", below: "displaced-down" };

/** Says how far the edges of `row` travel when it grows to fill `panel`,
 *  for what it displaces to move with them. */
export function measureDisplacement(row: Element, panel: Element) {
  const from = row.getBoundingClientRect();
  const to = panel.getBoundingClientRect();
  const root = document.documentElement.style;
  root.setProperty("--displace-up", `${Math.max(0, from.top - to.top)}px`);
  root.setProperty(
    "--displace-down",
    `${Math.max(0, to.bottom - from.bottom)}px`,
  );
}
