---
title: "@me"
---

Return the connected wallet address.

**Returns**: `address`

## Syntax

```evml
@me
```

## Examples

```evml
# Get own address
print @me

# Check own token balance
set $balance @get(@token(DAI) "balanceOf(address)(uint256)" @me)
print $balance

# Use in exec
exec @token(DAI) "approve(address,uint256)" @me 100e18
```

<!-- HAND-WRITTEN -->

## See Also

- [@get](get.md) — read contract state
- [@token.balance](token.balance.md) — shortcut for balance queries
