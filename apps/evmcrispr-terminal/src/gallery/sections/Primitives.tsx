import {
  Button,
  IconButton,
  Menu,
  Popover,
  Switch,
  Tabs,
  Tooltip,
  toast,
} from "@repo/ui";
import { Ellipsis, History, Share2 } from "@repo/ui/icons";
import { useState } from "react";
import { Example, Section } from "../kit";

export function Primitives() {
  const [on, setOn] = useState(true);
  return (
    <Section
      id="primitives"
      title="Menus, tabs, tooltips, toasts"
      note="The primitives the app already uses, now on Base UI: adapted from RetroUI, and from neobrutalism.dev for the drawer and the toasts."
    >
      <Example label="tabs: the active tab a filled block">
        <Tabs defaultValue="space" className="w-full max-w-md">
          <Tabs.List className="w-full">
            <Tabs.Trigger value="space" className="flex-1">
              Space
            </Tabs.Trigger>
            <Tabs.Trigger value="agents" className="flex-1">
              Agents
            </Tabs.Trigger>
            <Tabs.Trigger value="reference" className="flex-1">
              Reference
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="space">
            <p className="m-0 font-sans text-body text-fg-muted">
              The timeline of the open space.
            </p>
          </Tabs.Content>
          <Tabs.Content value="agents">
            <p className="m-0 font-sans text-body text-fg-muted">
              Your chats with the assistant.
            </p>
          </Tabs.Content>
          <Tabs.Content value="reference">
            <p className="m-0 font-sans text-body text-fg-muted">
              Commands and helpers.
            </p>
          </Tabs.Content>
        </Tabs>
      </Example>
      <Example label="tabs, line: for a quieter place">
        <Tabs defaultValue="all" className="w-full max-w-md">
          <Tabs.List variant="line" className="w-full justify-start">
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            <Tabs.Trigger value="commands">Commands</Tabs.Trigger>
            <Tabs.Trigger value="helpers">Helpers</Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      </Example>
      <Example label="menu, popover, tooltip, switch">
        <Menu>
          <Menu.Trigger
            render={
              <IconButton variant="neutral" size="sm" aria-label="Space menu" />
            }
          >
            <Ellipsis aria-hidden />
          </Menu.Trigger>
          <Menu.Content align="start">
            <Menu.Item>Export space…</Menu.Item>
            <Menu.Item>Clear for me</Menu.Item>
            <Menu.Item>Clear timeline…</Menu.Item>
          </Menu.Content>
        </Menu>
        <Popover>
          <Popover.Trigger
            render={
              <IconButton
                variant="neutral"
                size="sm"
                aria-label="Chat history"
              />
            }
          >
            <History aria-hidden />
          </Popover.Trigger>
          <Popover.Content align="start">
            <Popover.Title>Chats</Popover.Title>
            <Popover.Description>No previous chats</Popover.Description>
          </Popover.Content>
        </Popover>
        <Tooltip.Provider>
          <Tooltip>
            <Tooltip.Trigger
              render={
                <IconButton
                  variant="neutral"
                  size="sm"
                  aria-label="Share script"
                />
              }
            >
              <Share2 aria-hidden />
            </Tooltip.Trigger>
            <Tooltip.Content side="top">Share script</Tooltip.Content>
          </Tooltip>
        </Tooltip.Provider>
        <Switch
          aria-label="Example switch"
          checked={on}
          onCheckedChange={(checked) => setOn(checked)}
        />
      </Example>
      <Example label="toasts: plain, success, error, warning, loading then success">
        <Button
          variant="neutral"
          size="sm"
          onClick={() => toast("This space was removed")}
        >
          Plain
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => toast.success("The link is copied to the clipboard")}
        >
          Success
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => toast.error("The script could not be saved to IPFS")}
        >
          Error
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => toast.warning("Review the script before sharing it")}
        >
          Warning
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => {
            const id = toast.loading("Pinning 1 file to IPFS");
            setTimeout(
              () => toast.success("Pinned 1 file to IPFS", { id }),
              1500,
            );
          }}
        >
          Loading
        </Button>
      </Example>
    </Section>
  );
}
