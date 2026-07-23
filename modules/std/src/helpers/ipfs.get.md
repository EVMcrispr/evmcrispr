---
title: "@ipfs.get"
---

Fetch content from IPFS and return it as text.

**Returns**: `string`

## Syntax

```evml
@ipfs.get(cid)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `cid` | `string` | Content identifier to fetch |

<!-- HAND-WRITTEN -->

Content is pinned and returned byte-exact, so `@ipfs.get(@ipfs("hello"))` returns `hello`.

The terminal editor uses this helper automatically: pasting a hex string larger than 64 bytes pins it to IPFS and replaces it with an `@ipfs.get` call. Paste with `Ctrl+Shift+V` (`Cmd+Shift+V` on Mac) to keep the raw hex instead.

## Examples

```evml
# Send a raw transaction whose calldata is pinned on IPFS
send 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --data @ipfs.get("QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB")
```

```evml
# Round-trip text through IPFS
set $cid @ipfs("hello world")
set $content @ipfs.get($cid)
```

## See Also

- [@ipfs](ipfs.md) — upload content to IPFS and return the CID
