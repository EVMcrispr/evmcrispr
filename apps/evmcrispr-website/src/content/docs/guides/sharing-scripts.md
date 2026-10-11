---
title: Sharing Scripts
---

A finished script is often meant for someone else — a DAO proposal for
other members to review, a payout for a co-signer to execute, a snippet
for a teammate to build on. The terminal turns any script into a link
that opens it ready to review and run.

## Share Links

Click **Share** in the terminal to get a link to the current script. The
link is copied to your clipboard and looks like:

```
https://next.evmcrispr.com/#/<cid>#<key>
```

The address bar of your own terminal does not change when you share.

### The title is the first comment

A script has no separate title. Its title is its first line when that
line is a comment, so it travels with the script and cannot be lost or
left empty:

```evml
# Pay the team
set $amount 100e18
print $amount
```

This script is listed, shared and opened as "Pay the team". A script
that does not start with a comment is listed as "Untitled", followed by
the start of its first line.

### Sharing from a revision

Every script lives in a **space**, and the Space tab shows its
**timeline**: the revisions of the script and its runs. Each revision row
has a **Share** action, so you can share the script as it was at that
point, not only as it is now.

A revision that was shared reads **shared** in the timeline and offers
**Copy link**, which gives you the same link again. Nothing is uploaded a
second time.

Only a script you have reviewed can be shared. If the assistant changed
the script, or you merged an exported space into it, **Share** opens the
review first: you see what changed since the text you approved, and
sharing works once you approve it. A revision that holds neither the
approved text nor the script as it is now has to be loaded into the
editor and reviewed before it can be shared.

Behind the scenes the script is encrypted and pinned to IPFS:

- The script is encrypted in your browser with AES-256-GCM
  before it is uploaded — IPFS and the pinning service only ever see
  ciphertext.
- The decryption key is the final `#<key>` fragment of the link. URL
  fragments are never sent to servers, so **only people you give the link
  to can read the script**. There is no way to recover a script without
  its link.
- The content is addressed by hash (the `<cid>` segment), so the link
  permanently identifies the exact script you shared — it cannot be
  swapped out from under the people who received it.

Recipients see the script in the terminal, where they can review it,
simulate it, and execute it with their own wallet. Opening a share link
creates a new space in the recipient's browser, and its first revision
records the link it came from.

### Review before running

A script you open from a link is yours to read before anything is signed:
simulate it first (see [Simulation](simulation.md)). After that, the
terminal asks for a review whenever someone other than you changes a
script you had accepted: the assistant, or an exported space merged into
yours. Until you approve the change, **Execute** reads **Review changes**
and nothing can be sent or shared. Your own typing never needs a review.

## Exporting a Whole Space

A share link carries one script. An **export** carries a whole space: the
script, the revisions kept in its timeline and its runs with their
output. Use it to move a space to another browser or device, or to hand
all of it to someone else. Spaces are stored per browser (and separately
inside Safe), so exporting is how a space gets from one to the other.

Open the menu in the timeline's header and choose **Export space…**. The
link has the same shape as a share link and is encrypted the same way.
Before you send it, note what it is:

- **Anyone who gets the link can read everything in the space,
  permanently.** It cannot be taken back, and clearing the timeline later
  does not change what the link holds.
- It includes the links of the revisions you shared from that space.
- It does **not** include your chats with the assistant, which belong to
  your browser and not to any space, nor what you approved.

### Restoring an export

Opening an export link never does anything by itself. The terminal shows
what the link holds and asks:

- **Restore**, when the space is not in this browser: it is brought in
  under its own identity. Its script becomes the one you start from, as
  with a share link.
- **Merge**, when you already have that space: the script in the link
  replaces yours, and the link's revisions and runs are added to your
  timeline. Nothing you recorded is removed. Because the script came from
  outside, it has to be reviewed before it can run or be shared, and
  **Restore to before** on the merge's revision takes it back.
- **Open as copy**: a new, separate space made from the script alone.
- **Cancel**: nothing happens.

Whatever a link brought is marked **from an export** in the timeline:
the terminal cannot check who recorded it or when, so it never shows it
as yours. The output of an imported run is shown as plain text. The menu
offers **Remove imported records** to take all of it out again.

### Exports as modules

An export link also works wherever a share link does as a module source:
[`load --from`](publishing-modules.md) reads the space's current script
out of it.

```
load mylib --from "ipfs://<cid>#<key>"
```

Keep the quotes: the `#` before the key would otherwise start a comment.
Reading an export needs EVMcrispr 0.12.0 or later; an older version says
it has to be updated.

## Cleaning a Timeline

The same menu tidies a space:

- **Clear for me** hides everything recorded so far, in this browser
  only. **Show earlier** brings it back.
- **Clear timeline** removes every revision and finished run for good. It
  keeps the script as it is, runs that have not finished and the
  revisions you shared.
- **Remove**, on any revision or run, removes that one entry for good.
  This is how to take out a revision that holds something pasted by
  mistake.

Clearing and removing act on your browser's copy. Exports and share
links made earlier still contain what they contained.

## Sharing a Read-Only View

The terminal has an edit mode and a reading-oriented view mode. Share
links carry the mode you were in when you clicked **Share** (view mode
adds `?mode=view` to the link), so recipients land on the same surface —
they can still switch modes themselves.

## Sharing from the CLI or an AI Assistant

The same links can be produced outside the terminal:

```sh
npx evmcrispr create-link "Q3 payout" payout.evml
```

prints a share link for the script file (set `VITE_PINATA_JWT` to pin it
with your own Pinata account). AI assistants connected to the [MCP server](mcp.md) can do the
same with the `create-link` tool — a common flow is asking an assistant to
write and simulate a script, then hand you the link to execute it.

## Uploading Files to IPFS

Scripts sometimes need auxiliary content on IPFS — metadata for a
proposal, an image, a JSON config. Drag a file into the terminal editor
(or paste an image) and it is pinned to IPFS and inserted at the cursor as
`@ipfs.get("<cid>")`. Hovering the helper shows a preview of the pinned
content. Unlike share links, uploaded files are pinned as plain
(unencrypted) content.

## Next Steps

- [Publishing Modules](publishing-modules.md) — share reusable commands and helpers, not just scripts
- [Simulation](simulation.md) — what recipients should do before executing
