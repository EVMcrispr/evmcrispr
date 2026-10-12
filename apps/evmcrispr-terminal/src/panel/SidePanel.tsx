import { Tabs } from "@repo/ui";
import { Boxes, FileText, MessagesSquare } from "@repo/ui/icons";
import { morph } from "../app/morph";
import { type PanelTab, setUi, useUi } from "../app/ui-store";
import { AgentsTab } from "./agents/AgentsTab";
import { ReferenceTab } from "./reference/ReferenceTab";
import { SpaceTab } from "./space/SpaceTab";

const TABS = [
  { value: "space", label: "Spaces", Icon: Boxes, Content: SpaceTab },
  {
    value: "agents",
    label: "Agents",
    Icon: MessagesSquare,
    Content: AgentsTab,
  },
  {
    value: "reference",
    label: "Docs",
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
      // A tab asked for by hand slides in from its side of the row of
      // tabs, as the bar under them does; one the app turns to does not.
      onValueChange={(v) => {
        const order = TABS.map((tab) => tab.value as PanelTab);
        const forward = order.indexOf(v as PanelTab) > order.indexOf(activeTab);
        morph(
          () => setUi({ activeTab: v as PanelTab }),
          undefined,
          forward ? "panel-forward" : "panel-back",
        );
      }}
      className="h-full flex flex-col"
    >
      {/* Named for view transitions: what a space pushes out of the list
          leaves under the tabs, not over them. */}
      <Tabs.List className="@container w-full shrink-0 [view-transition-name:panel-chrome]">
        {TABS.map(({ value, label, Icon }) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="flex-1 gap-2 px-0 py-2.5 text-title"
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {/* What slides when the tab changes: the panels, not the tabs. */}
      <div data-side-panels className="flex min-h-0 flex-1 flex-col">
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
      </div>
    </Tabs>
  );
}
