---
title: "@ipfs"
---

Upload text content to IPFS and return the CID.

**Returns**: `string`

## Syntax

```evml
@ipfs(text)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | Content to upload |

## Examples

```evml
# Upload text to IPFS
set $cid @ipfs("hello world")
```

<!-- HAND-WRITTEN -->

Content is pinned byte-exact as plain text, so the CID addresses exactly the
text you uploaded — a pinned module file can be loaded directly with
[`load --from`](../commands/load.md).

## See Also

- [@ens:contenthash](../../../ens/src/helpers/contenthash.md) — encode IPFS hash for ENS
