import { Button, IconButton, Menu, Notice } from "@repo/ui";
import {
  CopyPlus,
  Ellipsis,
  Eye,
  History,
  Link,
  MessageSquare,
  SquarePen,
  Trash2,
  Undo2,
} from "@repo/ui/icons";

/**
 * What a revision's row offers once it is open: look at it, take the
 * change back when someone else made it, and the rest behind a menu.
 *
 * "Undo this change" takes that one change out and keeps what was made
 * after it. When later edits touch the same lines it cannot, says so, and
 * offers to go back to the script as it was before the change instead.
 */
export function RevisionActions({
  byOthers = false,
  shared = false,
  refused = false,
}: {
  /** Someone else made the change: it can be undone. */
  byOthers?: boolean;
  /** The revision was shared: its link can be copied again. */
  shared?: boolean;
  /** The state after an Undo that could not be done on its own. */
  refused?: boolean;
}) {
  return (
    <>
      <Button variant="quiet" size="row" icon={<Eye />}>
        View
      </Button>
      {byOthers && (
        <Button variant="quiet" size="row" icon={<Undo2 />}>
          Undo this change
        </Button>
      )}
      <Menu>
        <Menu.Trigger
          render={
            <IconButton variant="quiet" size="sm" aria-label="More actions" />
          }
        >
          <Ellipsis aria-hidden />
        </Menu.Trigger>
        <Menu.Content align="start">
          <Menu.Item>
            <SquarePen aria-hidden />
            Load in editor
          </Menu.Item>
          <Menu.Item>
            <CopyPlus aria-hidden />
            Open in new space
          </Menu.Item>
          {shared && (
            <Menu.Item>
              <Link aria-hidden />
              Copy link
            </Menu.Item>
          )}
          <Menu.Item>
            <Trash2 aria-hidden />
            Remove…
          </Menu.Item>
        </Menu.Content>
      </Menu>
      {refused && (
        <Notice
          tone="warning"
          className="w-full"
          action={
            <Button variant="quiet" size="row" icon={<History />}>
              Restore to before
            </Button>
          }
        >
          Later edits touch the same lines, so this change cannot be taken out
          on its own.
        </Notice>
      )}
    </>
  );
}

/** The way from a change to the chat it came from. */
export function OpenChat() {
  return (
    <IconButton variant="quiet" size="sm" aria-label="Open chat">
      <MessageSquare aria-hidden />
    </IconButton>
  );
}
