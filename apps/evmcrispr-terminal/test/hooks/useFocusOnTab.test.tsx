import { beforeEach, describe, expect, test } from "bun:test";
import { Tabs } from "@repo/ui";
import { act, render } from "@testing-library/react";
import { useFocusOnTab } from "../../src/hooks/useFocusOnTab";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../src/stores/terminal-store";

function LibInput() {
  const ref = useFocusOnTab<HTMLInputElement>("library");
  return <input ref={ref} placeholder="lib-search" />;
}

function ChatBox() {
  const ref = useFocusOnTab<HTMLTextAreaElement>("chat");
  return <textarea ref={ref} placeholder="chat-box" />;
}

/** Mirrors SidePanel's structure: forceMount + hidden keeps every tab
 *  mounted, so focus must react to reveals, not mounts. */
function Panel() {
  const activeTab = useTerminalStore().activeTab;
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) =>
        terminalStoreActions("activeTab", v as "library" | "chat")
      }
    >
      <Tabs.List>
        <Tabs.Trigger value="library">Library</Tabs.Trigger>
        <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="library" forceMount hidden={activeTab !== "library"}>
        <LibInput />
      </Tabs.Content>
      <Tabs.Content value="chat" forceMount hidden={activeTab !== "chat"}>
        <ChatBox />
      </Tabs.Content>
    </Tabs>
  );
}

beforeEach(() => {
  terminalStoreActions("activeTab", "library");
});

/** The hook defers focus one frame (to outlast the tab click's own focus
 *  handling), so tests must let that frame elapse. */
const switchTab = (tab: "library" | "chat") =>
  act(async () => {
    terminalStoreActions("activeTab", tab);
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
    await switchTab("chat");
    expect(document.activeElement?.getAttribute("placeholder")).toBe(
      "chat-box",
    );
  });

  test("focuses the library search when switching back", async () => {
    render(<Panel />);
    await switchTab("chat");
    await switchTab("library");
    expect(document.activeElement?.getAttribute("placeholder")).toBe(
      "lib-search",
    );
  });
});
