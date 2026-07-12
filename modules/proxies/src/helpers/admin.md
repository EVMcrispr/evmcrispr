---
title: "@proxies:admin"
---

Admin of a transparent ERC-1967 proxy (the ProxyAdmin contract on OpenZeppelin v5 proxies).

**Returns**: `address`

## Syntax

```evml
@proxies:admin(proxy)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proxy` | `address` | Proxy address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

# USDC's proxy admin on mainnet
print @proxies:admin(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
```

## Notes

- Reads the ERC-1967 admin slot directly (transparent proxies hide their
  admin functions from regular callers). On OpenZeppelin v5 proxies this is
  the auto-deployed ProxyAdmin contract.

## See Also

- [proxies:upgrade](../commands/upgrade.md)
