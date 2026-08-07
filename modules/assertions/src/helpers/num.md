---
title: "@assertions:num!"
---

Compose live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the combinators contract.

**Returns**: `number`

## Syntax

```evml
@assertions:num!(...expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...expression]` | `number` | Infix arithmetic over `::` calls, on-chain helpers and constants |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Live addition, judged on-chain at assertion time
assertions:assert @num!(@balance!(ETH @me) + @token(WETH)::balanceOf(@me)) > 5e18

# Scale by live decimals: 5 * 10 ^ decimals()
set $token 0x6B175474E89094C44Da98b954EedeAC495271d0F
assertions:assert $token::{balanceOf(address)(uint256) @me} >= @num!(5 * 10 ^ $token::{decimals()(uint8)})

# All-constant subtrees fold at build time
assertions:assert $token::{totalSupply()(uint256)} >= @num!(2 * 3e18)
```

## Notes

- Vocabulary mirrors std's `@num`: `+ - * / % ^` (`^` is exponentiation,
  compiled to `calcUint(Exp)`; not available for int operands), plus `xor`
  for bitwise xor. Comparisons and logic belong in `@bool!(…)`.
- Operands may be `::` calls, chains, other `!` helpers, or constants.
  Mixing an int operand promotes the whole expression to `calcInt`.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:bool!](bool.md)
