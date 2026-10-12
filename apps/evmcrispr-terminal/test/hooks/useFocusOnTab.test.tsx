import { beforeEach, describe, expect, test } from "bun:test";
import { Tabs } from "@repo/ui";
import { act, render } from "@testing-library/react";
import { setUi, useUi } from "../../src/app/ui-store";
import { useFocusOnTab } from "../../src/hooks/useFocusOnTab";

function LibInput() {
  const ref = useFocusOnTab<HTMLInputElement>("space");
  return <input ref={ref} placeholder="lib-search" />;
}

function ChatBox() {
  const ref = useFocusOnTab<HTMLTextAreaElement>("agents");
  return <textarea ref={ref} placeholder="chat-box" />;
}

/** Mirrors SidePanel's structure: forceMount + hidden keeps every tab
 *  mounted, so focus must react to reveals, not mounts. */
function Panel() {
  const activeTab = useUi((s) => s.activeTab);
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setUi({ activeTab: v as "space" | "agents" })}
    >
      <Tabs.List>
        <Tabs.Trigger value="space">Library</Tabs.Trigger>
        <Tabs.Trigger value="agents">Chat</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="space" keepMounted>
        <LibInput />
      </Tabs.Content>
      <Tabs.Content value="agents" keepMounted>
        <ChatBox />
      </Tabs.Content>
    </Tabs>
  );
}

beforeEach(() => {
  setUi({ activeTab: "space" });
});

/** The hook defers focus one frame (to outlast the tab click's own focus
 *  handling), so tests must let that frame elapse. */
const switchTab = (tab: "space" | "agents") =>
  act(async () => {
    setUi({ activeTab: tab });
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });

describe("useFocusOnTab", () => {
  test("does not grab focus on initial render", () => {
    render(<Panel />);
    expect(document.activeElement?.getAttribute("placeholder")).not.toBe(
      "lib-search",
    );
  });

  test("focuses the chat box when the chat tab is revealed", async () => {
    render(<Panel />);
    await switchTab("agents");
    expect(document.activeElement?.getAttribute("placeholder")).toBe(
      "chat-box",
    );
  });

  test("focuses the library search when switching back", async () => {
    render(<Panel />);
    await switchTab("agents");
    await switchTab("space");
    expect(document.activeElement?.getAttribute("placeholder")).toBe(
      "lib-search",
    );
  });
});
