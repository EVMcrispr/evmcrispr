import { Tabs } from "@repo/ui";
import { FileText, ListTree, MessagesSquare } from "@repo/ui/icons";
import { type PanelTab, setUi, useUi } from "../app/ui-store";
import { AgentsTab } from "./agents/AgentsTab";
import { ReferenceTab } from "./reference/ReferenceTab";
import { SpaceTab } from "./space/SpaceTab";

const TABS = [
  { value: "space", label: "Space", Icon: ListTree, Content: SpaceTab },
  {
    value: "agents",
    label: "Agents",
    Icon: MessagesSquare,
    Content: AgentsTab,
  },
  {
    value: "reference",
    label: "Reference",
    Icon: FileText,
    Content: ReferenceTab,
  },
] as const;

/** The side panel of the space on screen. Tabs stay mounted while hidden:
 *  the chat keeps its thread, the timeline its scroll. */
export function SidePanel() {
  const activeTab = useUi((s) => s.activeTab);
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setUi({ activeTab: v as PanelTab })}
      className="h-full flex flex-col"
    >
      <Tabs.List className="@container w-full shrink-0">
        {TABS.map(({ value, label, Icon }) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="flex-1 gap-1.5 px-0"
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TABS.map(({ value, Content }) => (
        <Tabs.Content
          key={value}
          value={value}
          className="flex-1 overflow-hidden"
          keepMounted
        >
          <Content />
        </Tabs.Content>
      ))}
    </Tabs>
  );
}
