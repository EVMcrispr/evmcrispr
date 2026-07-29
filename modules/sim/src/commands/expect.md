---
title: "sim:expect"
---

Assert that a condition is true.

## Syntax

```evml
sim:expect <condition>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `condition` | `bool` | Boolean condition to assert |

## Examples

```evml
# Assert a simple condition
sim:expect true

# Assert with variables
set $a 42
sim:expect @bool($a == 42)
```

<!-- HAND-WRITTEN -->

## Notes

- If the condition is false, the script halts with an assertion error
- Typically used inside `sim:fork` blocks to verify simulated outcomes

## See Also

- [fork](fork.md) — simulate on a forked chain
- [@bool](../../../std/src/helpers/bool.md) — boolean expressions
