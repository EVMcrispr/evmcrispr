---
title: "proxies:clone"
---

Deploy an ERC-1167 minimal proxy (clone) of an implementation contract. Binds the predicted clone address to <variable>. Pass --salt for a deterministic CREATE2 deployment.

## Syntax

```evml
proxies:clone <variable> <implementation>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the clone address to |
| `implementation` | `address` | Implementation contract the clone delegates to |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--salt` | `bytes32` | Salt for deterministic CREATE2 deployment through the Arachnid deployer (override with --via) |
| `--via` | `address` | Override the CREATE2 factory address used with --salt |
| `--from` | `address` | Sender address. Defaults to the connected wallet. For plain CREATE this is also the prediction deployer. |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

# Plain CREATE clone
proxies:clone $vesting $vestingImplementation
exec $vesting initialize(address,uint64) @me 1767225600

# Deterministic CREATE2 clone (batchable, predictable address)
proxies:clone $vesting $vestingImplementation --salt 0x0000000000000000000000000000000000000000000000000000000000000001
```

## Notes

- Deploys an ERC-1167 minimal proxy that delegates every call to the
  implementation. Clones are cheap but not upgradeable.
- The predicted address is bound to the variable before deployment, so later
  commands in the same script can use it.
- Plain CREATE clones cannot run inside a batch (the nonce-based prediction
  would drift) — use `--salt` there.

## See Also

- [@proxies.predictClone](../helpers/proxies.predictClone.md) — predict without deploying
