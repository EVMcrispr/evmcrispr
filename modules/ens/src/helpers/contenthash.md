---
title: "@ens:contenthash"
---

Encode a content hash (ipfs, ipns, skynet) for ENS records.

**Returns**: `bytes`

## Syntax

```evml
@ens:contenthash(input)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `input` | `string` | Content hash (e.g. "ipfs:Qm...") |

## Examples

```evml
# Encode an IPFS content hash
set $hash @ens:contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")
print $hash
```

<!-- HAND-WRITTEN -->

## Notes

- Supported codecs: `ipfs`, `ipns`, `skynet`
- Format: `codec:hash`

## See Also

- [ens:renew](../commands/renew.md) — renew ENS domains
- [@ipfs](../../../std/src/helpers/ipfs.md) — upload content to IPFS
