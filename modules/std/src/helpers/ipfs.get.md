---
title: "@ipfs.get"
---

Fetch content from IPFS and return it as text.

**Returns**: `any`

## Syntax

```evml
@ipfs.get(cid)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `cid` | `string` | Content identifier to fetch |

<!-- HAND-WRITTEN -->

Content pinned with `@ipfs` is stored JSON-quoted; `@ipfs.get` unwraps it, so `@ipfs.get(@ipfs("hello"))` returns `hello`.

The terminal editor uses this helper automatically: pasting a hex string larger than 64 bytes pins it to IPFS and replaces it with an `@ipfs.get` call. Paste with `Ctrl+Shift+V` (`Cmd+Shift+V` on Mac) to keep the raw hex instead.

## Examples

```evml
# Deploy a contract whose creation bytecode is pinned on IPFS
deploy $token @ipfs.get("QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB") --constructor constructor(string,string) --constructor-args ["My Token", "TKN"]
```

```evml
# Round-trip text through IPFS
set $cid @ipfs("hello world")
set $content @ipfs.get($cid)
```

## See Also

- [@ipfs](ipfs.md) — upload content to IPFS and return the CID
