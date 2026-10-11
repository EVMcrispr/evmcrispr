import {
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  QueueListIcon,
} from "@heroicons/react/24/solid";
import { Tabs } from "@repo/ui";
import { type PanelTab, setUi, useUi } from "../app/ui-store";
import { AgentsTab } from "./agents/AgentsTab";
import { ReferenceTab } from "./reference/ReferenceTab";
import { SpaceTab } from "./space/SpaceTab";

const TABS = [
  { value: "space", label: "Space", Icon: QueueListIcon, Content: SpaceTab },
  {
    value: "agents",
    label: "Agents",
    Icon: ChatBubbleLeftRightIcon,
    Content: AgentsTab,
  },
  {
    value: "reference",
    label: "Reference",
    Icon: DocumentTextIcon,
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
      <Tabs.List className="@container w-full shrink-0 px-3 border-b-0">
        {TABS.map(({ value, label, Icon }) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="flex-1 min-w-0 px-0 gap-1 @lg:gap-1.5 text-xs @md:text-base @lg:text-xl"
          >
            <Icon className="w-3.5 h-3.5 @md:w-4 @md:h-4 @lg:w-5 @lg:h-5 shrink-0" />
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TABS.map(({ value, Content }) => (
        <Tabs.Content
          key={value}
          value={value}
          className="flex-1 min-h-0 overflow-hidden"
          forceMount
          hidden={activeTab !== value}
        >
          <Content />
        </Tabs.Content>
      ))}
    </Tabs>
  );
}
