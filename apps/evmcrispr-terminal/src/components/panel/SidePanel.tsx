import { Console } from "@evmcrispr/editor";
import { Tabs } from "@repo/ui";
import type { TerminalStoreState } from "../../stores/terminal-store";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { LibraryTab } from "./LibraryTab";
import { ReferenceTab } from "./ReferenceTab";

export function SidePanel({
  logs,
  errors,
}: {
  logs: string[];
  errors: string[];
}) {
  const activeTab = useTerminalStore().activeTab;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) =>
        terminalStoreActions("activeTab", v as TerminalStoreState["activeTab"])
      }
      className="h-full flex flex-col"
    >
      <Tabs.List className="w-full shrink-0 px-2">
        <Tabs.Trigger value="console">Console</Tabs.Trigger>
        <Tabs.Trigger value="library">Library</Tabs.Trigger>
        <Tabs.Trigger value="reference">Ref</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content
        value="console"
        className="flex-1 overflow-hidden"
        forceMount
        hidden={activeTab !== "console"}
      >
        <Console logs={logs} errors={errors} />
      </Tabs.Content>
      <Tabs.Content
        value="library"
        className="flex-1 overflow-hidden"
        forceMount
        hidden={activeTab !== "library"}
      >
        <LibraryTab />
      </Tabs.Content>
      <Tabs.Content
        value="reference"
        className="flex-1 overflow-hidden"
        forceMount
        hidden={activeTab !== "reference"}
      >
        <ReferenceTab />
      </Tabs.Content>
    </Tabs>
  );
}
