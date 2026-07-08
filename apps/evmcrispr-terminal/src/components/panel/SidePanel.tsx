import { Console } from "@evmcrispr/editor";
import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CommandLineIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/solid";
import { Tabs } from "@repo/ui";
import type { TerminalStoreState } from "../../stores/terminal-store";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { ChatPanel } from "./ChatPanel";
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
      <Tabs.List className="w-full shrink-0 px-2 border-b-0">
        <Tabs.Trigger value="console" className="text-xl">
          <CommandLineIcon className="w-5 h-5" />
          Console
        </Tabs.Trigger>
        <Tabs.Trigger value="library" className="text-xl">
          <BookOpenIcon className="w-5 h-5" />
          Library
        </Tabs.Trigger>
        <Tabs.Trigger value="reference" className="text-xl">
          <DocumentTextIcon className="w-5 h-5" />
          Ref
        </Tabs.Trigger>
        <Tabs.Trigger value="chat" className="text-xl">
          <ChatBubbleLeftRightIcon className="w-5 h-5" />
          Chat
        </Tabs.Trigger>
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
      <Tabs.Content
        value="chat"
        className="flex-1 overflow-hidden"
        forceMount
        hidden={activeTab !== "chat"}
      >
        <ChatPanel />
      </Tabs.Content>
    </Tabs>
  );
}
