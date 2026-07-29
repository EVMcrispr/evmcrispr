---
title: "@proxies:implementation"
---

Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy.

**Returns**: `address`

## Syntax

```evml
@proxies:implementation(proxy)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proxy` | `address` | Proxy address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

# USDC's transparent proxy on mainnet
print @proxies:implementation(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
```

## Notes

- Reads the ERC-1967 implementation slot directly; for beacon proxies it
  follows the beacon and returns its `implementation()`.

## See Also

- [proxies:upgrade](../commands/upgrade.md)
- [@proxies:admin](admin.md) / [@proxies:beacon](beacon.md)
