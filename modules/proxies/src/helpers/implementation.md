---
title: "@proxies:implementation"
---

Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy.

**On-chain (`@proxies:implementation!`)**: Resolves through the proxy's ProxyAdmin when one reports it, else an `implementation()` call or the beacon hop, so a slot-only proxy with no such admin reverts.

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

Resolve the implementation at assertion time. A transparent proxy shows
`implementation()` only to its admin, so when the proxy's admin is a
ProxyAdmin that reports it through `getProxyImplementation(proxy)`
(OpenZeppelin's before v5, Optimism's), the assertion asks that ProxyAdmin
first. The admin is read while the script is built; a proxy handed to
another admin since makes that read revert, and the next routes are tried.
Otherwise it is a direct `implementation()` call when the proxy exposes
one, else the `beacon()` -> `implementation()` hop. The proxy may be a
`::!` call returning its address, read when the assertion runs; then there
is no admin to ask, only the other two routes.

### Examples

```evml
load proxies

set $proxy 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
set $logic 0xd8da6bf26964af9d7eed9e03e53415d37aa96045

assert @implementation!($proxy) == $logic "implementation changed"
```

### Notes

- A proxy with no reporting ProxyAdmin, no `implementation()` for other
  callers and no beacon (an OpenZeppelin v5 transparent proxy, whose
  ProxyAdmin has no getter) reverts on every route: a contract cannot read
  another's storage, so that read stays off-chain with the plain face.
- A simulation suggests this check after an upgrade only when one of these
  routes reads the new implementation for the assertion: a check that
  would certainly fail is not suggested.

### See Also

- `assert`, `@codeHash!`
