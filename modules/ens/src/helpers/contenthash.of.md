---
title: "@ens:contenthash.of"
---

Read the decoded content hash of an ENS name (e.g. ipfs://…).

**Returns**: `string`

## Syntax

```evml
@ens:contenthash.of(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Read the content hash behind a name
set $hash @ens:contenthash.of("vitalik.eth")
print $hash
```

<!-- HAND-WRITTEN -->

## On-chain face (@ens:contenthash.of!)

Mainnet only. Reads the raw multicodec bytes the resolver holds — the
decoded `ipfs://…` rendering is off-chain work — through the
`@addr!`-shaped resolver chain, with a missing resolver reading as empty
bytes instead of erroring. The plain `@ens:contenthash` encoder produces
the same raw bytes from a URI, so pinning a site's content is:

```evml novalidate
assert @ens:contenthash.of!(mysite.eth) == @ens:contenthash("ipfs://Qm...")
```

## See Also
