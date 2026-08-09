---
title: "@proxies:implementation"
---

Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy. As @implementation! the resolution happens on-chain at assertion time through orElse: a direct implementation() call when the proxy exposes one, else the beacon() -> implementation() hop — slot-only proxies stay off-chain (both branches revert).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

## On-chain face (@implementation!)

Resolve the implementation at assertion time through the core's orElse:
a direct implementation() call when the proxy exposes one, else the
beacon() -> implementation() hop through the core chain.

### Examples

```evml
load assertions
load proxies

set $proxy 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
set $logic 0xd8da6bf26964af9d7eed9e03e53415d37aa96045

assertions:assert @implementation!($proxy) == $logic "implementation changed"
```

### Notes

- ERC-1967 slot-only proxies (transparent proxies without a public
  implementation() or beacon()) revert on both branches: those reads
  stay off-chain with the plain face.

### See Also

- `assertions:assert`, `@codehash!`
