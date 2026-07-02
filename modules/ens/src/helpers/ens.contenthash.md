---
title: "@ens:ens.contenthash"
---

Read the decoded content hash of an ENS name (e.g. ipfs://…).

**Returns**: `string`

## Syntax

```evml
@ens:ens.contenthash(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Read the content hash behind a name
set $hash @ens.contenthash("vitalik.eth")
print $hash
```

<!-- HAND-WRITTEN -->

## See Also
