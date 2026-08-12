---
title: "@ens:text"
---

Read a text record from an ENS name.

**Returns**: `string`

## Syntax

```evml
@ens:text(name key)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |
| `key` | `string` | Text record key (e.g. "url", "com.twitter", "description") |

## Examples

```evml
# Read a URL text record
set $url @ens:text("vitalik.eth" "url")
print $url

# Read a Twitter handle
set $twitter @ens:text("vitalik.eth" "com.twitter")
print $twitter
```

<!-- HAND-WRITTEN -->

## On-chain face (@ens:text!)

Mainnet only, like every ENS face: an assertion is judged on the chain it
runs on, and ENS cannot be reached from another chain. The face is the
`@addr!` shape with the resolver's `text(node, key)` call in the chain
hop: `resolver(node)` on the registry, a hop into whatever resolver that
word holds at judgement, and a `cond` that turns an unset resolver into
the empty string. A resolver that exists but has no record for the key
also answers the empty string — where the plain face errors — so assert
against `""` to express absence.

## See Also

- [@ens:name](name.md) — reverse-resolve an address
- [@ens:avatar](avatar.md) — get the avatar URI
