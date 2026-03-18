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

## See Also

- [@ens:contenthash](../../../ens/src/helpers/contenthash.md) — encode IPFS hash for ENS
