# proxies module

Proxy operations: ERC-1167 clones and ERC-1967 proxy/beacon upgrades.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load proxies
```

## Commands

| Command | Description |
|---------|-------------|
| [proxies:clone](src/commands/clone.md) | Deploy an ERC-1167 minimal proxy (clone) of an implementation contract. Binds the predicted clone address to <variable>. Pass --salt for a deterministic CREATE2 deployment. |
| [proxies:upgrade](src/commands/upgrade.md) | Upgrade an ERC-1967 proxy to a new implementation, detecting whether it is a transparent proxy (upgraded through its ProxyAdmin) or a UUPS proxy (upgraded through itself). Optionally calls an initializer on the new implementation. |
| [proxies:upgrade-beacon](src/commands/upgrade-beacon.md) | Upgrade an UpgradeableBeacon to a new implementation, upgrading every beacon proxy that points to it at once. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@proxies:admin](src/helpers/admin.md) | `address` | Admin of a transparent ERC-1967 proxy (the ProxyAdmin contract on OpenZeppelin v5 proxies). |
| [@proxies:beacon](src/helpers/beacon.md) | `address` | Beacon address of an ERC-1967 beacon proxy. |
| [@proxies:implementation](src/helpers/implementation.md) | `address` | Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy. |
| [@proxies:predictClone](src/helpers/predictClone.md) | `address` | Predicted address of a deterministic ERC-1167 clone deployed with proxies:clone --salt. Pure computation, no chain read. |

