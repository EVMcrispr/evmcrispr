---
title: "ens:set-contenthash"
---

Set the content hash of an ENS name.

## Syntax

```evml
ens:set-contenthash <name> <hash>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |
| `hash` | `string` | Content hash ("ipfs://Qm…", "ipns://…", "skynet://…" or encoded 0x bytes) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Point mydao.eth at an IPFS CID
ens:set-contenthash mydao.eth "ipfs://QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4"

# Point at an IPNS name
ens:set-contenthash mydao.eth "ipns://k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8"
```

## Notes

- Accepts `ipfs`, `ipns` and `skynet` URIs (`codec:hash` or `codec://hash`)
  or already-encoded EIP-1577 `0x` bytes (e.g. from `@contenthash`).

## See Also

- [@contenthash](../helpers/contenthash.md) — encode a content hash
- [@ens.contenthash](../helpers/ens.contenthash.md) — read a content hash
