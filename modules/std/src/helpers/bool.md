---
title: "@bool"
---

Evaluate a boolean expression or convert a value to a boolean string.

**On-chain (`@bool!`)**: Composes live comparisons with on-chain logic: `and`, `or`, `xor` and `not`.

**Returns**: `bool`

## Syntax

```evml
@bool(...tokens)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...tokens]` | `any` | Boolean expression (e.g. `$a > 0 and $b < 100`) |

## Examples

```evml
# Comparisons
set $a @bool(1 == 1)
set $b @bool(5 > 3)
set $c @bool(5 <= 3)

# Logical operators
set $e @bool(true and true)
set $f @bool(true or false)
set $g @bool(not false)

# Compound expression
set $x 10
set $h @bool($x > 0 and $x < 100)
```

<!-- HAND-WRITTEN -->

## See Also

- [if](../commands/if.md) — conditional execution
- [loop](../commands/loop.md) — condition-based loop

## On-chain face (@bool!)

Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the operators contract.

#
