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

Behind the scenes the script is encrypted and pinned to IPFS:

- The script (and its title) is encrypted in your browser with AES-256-GCM
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
simulate it, and execute it with their own wallet.

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

prints a share link for the script file (set `VITE_PINATA_JWT` for IPFS
pinning). AI assistants connected to the [MCP server](mcp.md) can do the
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
