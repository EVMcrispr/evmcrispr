---
title: "@token:totalSupply"
---

Fetch the total supply of a token in base units.

**Returns**: `number`

## Syntax

```evml
@token:totalSupply(tokenSymbol)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenSymbol` | `token-symbol` | Token symbol (e.g. `DAI`) or address |

## Examples

```evml
# Query the total supply of a token
set $supply @token:totalSupply(DAI)

# Print the total supply in human-readable form
print @token:format(DAI @token:totalSupply(DAI))
```

<!-- HAND-WRITTEN -->

## See Also

- [@token:balance](balance.md)
- [@token:format](format.md)
