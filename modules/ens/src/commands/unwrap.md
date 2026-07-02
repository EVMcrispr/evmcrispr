---
title: "ens:unwrap"
---

Unwrap an ENS name from the NameWrapper.

## Syntax

```evml
ens:unwrap <name>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Wrapped ENS name (e.g. mydao.eth) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Unwrap a name back to the executing account
ens:unwrap mydao.eth
```

## Notes

- Fails if the name has burned `cannot-unwrap`.

## See Also

- [ens:wrap](wrap.md) — wrap a name
