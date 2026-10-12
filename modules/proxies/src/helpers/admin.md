---
title: "@proxies:admin"
---

Admin of a transparent ERC-1967 proxy (the ProxyAdmin contract on OpenZeppelin v5 proxies).

**On-chain (`@proxies:admin!`)**: Calls `admin()` on the proxy, not the ERC-1967 slot: it reverts where the proxy hides it and trusts what the proxy answers.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

## On-chain face (@admin!)

Calls `admin()` on the proxy when the assertion runs. A contract cannot read
another contract's storage, so the ERC-1967 slot the plain face reads is out
of reach on-chain: what `admin()` answers is the answer of the proxy itself.
The proxy may be a `::!` call returning its address.

### Examples

```evml
load proxies

set $proxy 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
set $expected 0xd8da6bf26964af9d7eed9e03e53415d37aa96045

assert @proxies:admin!($proxy) == $expected "admin changed"
```

### Notes

- A proxy that does not expose `admin()` to every caller (a transparent proxy
  answers its admin only) reverts: that read stays off-chain with the plain
  face.
