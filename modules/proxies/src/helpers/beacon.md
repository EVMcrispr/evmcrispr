---
title: "@proxies:beacon"
---

Beacon address of an ERC-1967 beacon proxy.

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
