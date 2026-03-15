# sim:expect

Assert that a condition is true.

## Syntax

```
sim:expect <condition>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| condition | `bool` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Assert a simple condition
sim:expect true

# Assert equality
sim:expect @bool(1 == 1)

# Assert with variables
set $a 42
sim:expect @bool($a == 42)

# Assert contract state after simulation
sim:fork (
  sim:set-balance @me 100e18
  sim:expect @bool(@get(@token(DAI) "balanceOf(address)(uint256)" @me) > 0)
)
```

## Notes

- If the condition is false, the script halts with an assertion error
- Typically used inside `sim:fork` blocks to verify simulated outcomes

## See Also

- [fork](fork.md) — simulate on a forked chain
- [@bool](../../std/src/helpers/bool.md) — boolean expressions
