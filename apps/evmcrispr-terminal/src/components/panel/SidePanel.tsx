import { Console } from "@evmcrispr/editor";
import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CommandLineIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/solid";
import { Tabs } from "@repo/ui";
import { useLegacy } from "../../app/legacy-execution";
import { useSpace } from "../../app/SpaceContext";
import { type PanelTab, setUi, useUi } from "../../app/ui-store";
import { ScriptIO } from "../execution/ScriptIO";
import { ChatPanel } from "./ChatPanel";
import { LibraryTab } from "./LibraryTab";
import { ReferenceTab } from "./ReferenceTab";

/** The side panel of the space on screen. */
export function SidePanel() {
  const space = useSpace();
  const activeTab = useUi((s) => s.activeTab);
  const isLoading = useUi((s) => s.isLoading);
  const { execution, input, setInput } = useLegacy();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setUi({ activeTab: v as PanelTab })}
      className="h-full flex flex-col"
    >
      <Tabs.List className="@container w-full shrink-0 px-3 border-b-0">
        <Tabs.Trigger
          value="console"
          className="flex-1 min-w-0 px-0 gap-1 @lg:gap-1.5 text-xs @md:text-base @lg:text-xl"
        >
          <CommandLineIcon className="w-3.5 h-3.5 @md:w-4 @md:h-4 @lg:w-5 @lg:h-5 shrink-0" />
          Console
        </Tabs.Trigger>
        <Tabs.Trigger
          value="library"
          className="flex-1 min-w-0 px-0 gap-1 @lg:gap-1.5 text-xs @md:text-base @lg:text-xl"
        >
          <BookOpenIcon className="w-3.5 h-3.5 @md:w-4 @md:h-4 @lg:w-5 @lg:h-5 shrink-0" />
          Library
        </Tabs.Trigger>
        <Tabs.Trigger
          value="reference"
          className="flex-1 min-w-0 px-0 gap-1 @lg:gap-1.5 text-xs @md:text-base @lg:text-xl"
        >
          <DocumentTextIcon className="w-3.5 h-3.5 @md:w-4 @md:h-4 @lg:w-5 @lg:h-5 shrink-0" />
          Reference
        </Tabs.Trigger>
        <Tabs.Trigger
          value="chat"
          className="flex-1 min-w-0 px-0 gap-1 @lg:gap-1.5 text-xs @md:text-base @lg:text-xl"
        >
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 @md:w-4 @md:h-4 @lg:w-5 @lg:h-5 shrink-0" />
          Chat
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content
        value="console"
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        forceMount
        hidden={activeTab !== "console"}
      >
        <div className="shrink-0 border-b border-foreground/10 px-4 py-2">
          <ScriptIO
            key={space.id}
            input={input}
            disabled={isLoading}
            onChange={setInput}
            output={execution.output}
          />
        </div>
        <div className="min-h-0 flex-1">
          <Console entries={execution.entries} errors={execution.errors} />
        </div>
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
