---
title: "@proxies:beacon"
---

Beacon address of an ERC-1967 beacon proxy.

**On-chain (`@proxies:beacon!`)**: Calls `beacon()` on the proxy, not the ERC-1967 slot: it reverts where the proxy hides it and trusts what the proxy answers.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@proxies:beacon(proxy)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proxy` | `address` | Proxy address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

set $proxy 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
print @proxies:beacon($proxy)
```

## Notes

- Reads the ERC-1967 beacon slot; fails on non-beacon proxies.

## See Also

- [proxies:upgrade-beacon](../commands/upgrade-beacon.md)
- [@proxies:implementation](implementation.md)

## On-chain face (@beacon!)

Calls `beacon()` on the proxy when the assertion runs. A contract cannot read
another contract's storage, so the ERC-1967 slot the plain face reads is out
of reach on-chain: what `beacon()` answers is the answer of the proxy itself.
The proxy may be a `::!` call returning its address.

### Examples

```evml
load proxies

set $proxy 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
set $expected 0xd8da6bf26964af9d7eed9e03e53415d37aa96045

assert @proxies:beacon!($proxy) == $expected "beacon changed"
```

### Notes

- A proxy that does not expose `beacon()` to every caller (a transparent proxy
  answers its admin only) reverts: that read stays off-chain with the plain
  face.
