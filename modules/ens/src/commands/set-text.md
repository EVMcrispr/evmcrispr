---
title: "ens:set-text"
---

Set a text record on an ENS name.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
ens:set-text <name> <key> <value>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | ENS name (e.g. mydao.eth) |
| `key` | `string` | Runtime in smart blocks | Text record key (e.g. "url", "com.twitter") |
| `value` | `string` | Runtime in smart blocks | Text record value |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Set common text records on a name you own
ens:set-text mydao.eth url "https://mydao.example"
ens:set-text mydao.eth com.twitter "mydao"
ens:set-text mydao.eth description "Community-owned treasury"
```

## Notes

- The action is sent to the name's current resolver; the executing account
  must own (or operate) the name.

## See Also

- [@ens:text](../helpers/text.md) — read a text record
