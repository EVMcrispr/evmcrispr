---
title: "ens:set-resolver"
---

Set the resolver contract of an ENS name.

## Syntax

```evml
ens:set-resolver <name> <resolver>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |
| `resolver` | `address` | Resolver address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Switch mydao.eth to the latest public resolver
ens:set-resolver mydao.eth 0xF29100983E058B709F3D539b0c765937B804AC15
```

## Notes

- Wrapped names are handled automatically (the action goes through the
  NameWrapper instead of the registry).

## See Also

- [@ens:resolver](../helpers/resolver.md) — read the current resolver
