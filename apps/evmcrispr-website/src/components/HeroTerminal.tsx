import { EvmcrisprTerminal } from "@evmcrispr/editor";
import { Tabs } from "@repo/ui";
import { useEffect, useRef, useState } from "react";

// Example scripts avoid @me — the hero terminal runs in no-wallet mode, so
// there is no connected account for it to resolve to.
const EXAMPLES = [
  `load token

# Send 100 DAI to a friend
set $to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $amount @token:amount(DAI 100)

exec @token(DAI) "transfer(address,uint256)" $to $amount`,

  `load token

# Read on-chain state — no transaction needed
set $holder 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $balance @get(@token(DAI) "balanceOf(address)(uint256)" $holder)

print "DAI balance: " $balance`,

  `load token

# Approve and deposit into sDAI in one transaction
set $vault 0x83F20F44975D03b1b09e64809B757c47f942BEeA
set $to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $amount @token:amount(DAI 100)

batch (
  exec @token(DAI) "approve(address,uint256)" $vault $amount
  exec $vault "deposit(uint256,address)" $amount $to
)`,
];

/**
 * Homepage hero embed. Starts in the lightweight Shiki viewer and only
 * pulls Monaco in when the visitor clicks into the script to edit it.
 */
export default function HeroTerminal() {
  const [active, setActive] = useState(0);
  // Edits are kept per tab, so visitors can tweak an example, peek at
  // another and come back without losing their changes.
  const [scripts, setScripts] = useState(() => [...EXAMPLES]);
  const [mode, setMode] = useState<"edit" | "view">("view");
  const containerRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the terminal drops back to the viewer.
  // Monaco keeps its widgets (hover, suggest) inside its own DOM tree, so
  // a simple containment check is enough; edits are preserved because the
  // editor flushes pending changes on unmount.
  useEffect(() => {
    if (mode !== "edit") return;
    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (e.target instanceof Node && container.contains(e.target)) return;
      setMode("view");
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mode]);

  return (
    // The frame (border, rounding, gray surface) lives on this wrapper so
    // the tabs sit visually inside the editor; the terminal's own frame is
    // stripped via className below.
    <div
      ref={containerRef}
      className="flex-1 flex flex-col min-h-0 rounded-(--radius) border-2 border-evm-gray-800/75 bg-evm-gray-900 overflow-hidden"
    >
      <Tabs
        value={String(active)}
        onValueChange={(v) => {
          setActive(Number(v));
          // Monaco only reads the script on mount; dropping to the viewer
          // (which renders reactively) keeps the displayed script correct.
          setMode("view");
        }}
      >
        {/* The bottom margin keeps the triggers' hanging underline
            (mb-[-2px]) visible and gives the script some air. */}
        <Tabs.List className="w-full border-b-0 mb-3">
          {EXAMPLES.map((_, i) => (
            // The list is static and the index IS the tab identity.
            <Tabs.Trigger key={i} value={String(i)} className="flex-1">
              Example {i + 1}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
      <EvmcrisprTerminal
        // Remounting per tab makes Monaco's unmount flush deliver any
        // pending edit to the tab it belongs to (the old instance keeps the
        // old tab's onScriptChange closure).
        key={active}
        script={scripts[active]}
        onScriptChange={(s) =>
          setScripts((prev) => prev.map((p, i) => (i === active ? s : p)))
        }
        mode={mode}
        onModeChange={setMode}
        // The script area flexes to whatever height the hero column gives
        // the terminal, so it lines up with the intro text on the left.
        height="fill"
        // Smaller than the package default (22px) so the demo script fits
        // the hero comfortably.
        fontSize={16}
        // Monaco needs the frame's gray as a concrete color — it can't
        // inherit a background, and a transparent one breaks its overlay
        // features. Keep in sync with the `hero-terminal` CSS override.
        editorBackground="#121212"
        // Match the docs code blocks: gray surface instead of the default
        // black + green frame. The gray background comes from the
        // `hero-terminal` override in index.css (the editor package's
        // `--background` token can't be beaten by a layered utility);
        // border and rounding moved to the wrapper above.
        className="hero-terminal flex-1 border-0 rounded-none"
        modules={[
          { name: "token", load: () => import("@evmcrispr/module-token") },
        ]}
      />
    </div>
  );
}
