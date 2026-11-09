---
title: "ens:renew"
---

Renew .eth names, paid in an ERC-20 (USDC by default): ENSv2 names on the ETHRegistrar, names still on ENS v1 on ETHRenewerV1, each with one approval and one batch.

Smart blocks: build-time inputs only. Each name is routed to its renewer and priced in the payment token when the script is built.

## Syntax

```evml
ens:renew <domains> <duration>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `domains` | `string \| array` | Build time | ENS label(s) or names to renew |
| `duration` | `number` | Build time | Renewal duration, in time units (e.g. 1y) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--payment-token` | `address` | Build time | ERC-20 the renewal is paid in, from the sender: USDC (default) or DAI |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Renew a single name for one year, paid in USDC
ens:renew "mydomain" 1y

# Renew several at once, paid in DAI
ens:renew ["domain1" "domain2" "domain3"] 1y --payment-token 0x6B175474E89094C44Da98b954EedeAC495271d0F
```

## Notes

- Since ENSv2 every .eth name renews through ENSv2's contracts, paid in an
  ERC-20 from the sender (USDC by default, or DAI; no ETH): an ENSv2 name on
  the ETHRegistrar, a name still on ENS v1 (wrapped or not) on ETHRenewerV1.
  Each name goes to the one that takes it.
- The names of each renewer renew in one batch, after one approval of their
  total when the sender's allowance is short.
- Prices are quoted, and the duration fixed, when the script is built.

## See Also

- [ens:register](register.md) — register a name
