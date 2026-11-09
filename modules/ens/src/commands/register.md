---
title: "ens:register"
---

Register a .eth name with ENSv2's ETHRegistrar: commit, wait, then approve the payment token (USDC by default) and reveal, in one go by default.

Smart blocks: build-time inputs only. Commitment hashing and price quotes require concrete registration inputs.

## Syntax

```evml
ens:register <name> <owner> <duration>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | .eth name or label (e.g. mydao.eth or mydao) |
| `owner` | `address` | Build time | Owner of the name |
| `duration` | `number` | Build time | Registration duration, in time units (e.g. 1y); 28 days at least |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--secret` | `bytes32` | Build time | Commitment secret; must be identical across the commit and reveal steps |
| `--payment-token` | `address` | Build time | ERC-20 the registration is paid in, from the sender: USDC (default) or DAI |
| `--resolver` | `address` | Build time | Resolver to set at registration (default: none) |
| `--subregistry` | `address` | Build time | Registry for the name's subnames (default: none) |
| `--reverse-record` | `bool` | Build time | Not available on ENSv2: set the primary name with ens:set-primary-name instead |
| `--step` | `string` | Build time | Which part of the flow to run: commit-wait-reveal (default), only-commit, only-reveal, only-commit-and-wait, only-wait-and-reveal |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Commit, wait ~70s, approve USDC and reveal in one script (default)
ens:register mydao @me 1y --secret @hash("my registration secret")

# Pay in DAI instead
ens:register mydao @me 1y --secret @hash("my registration secret") --payment-token 0x6B175474E89094C44Da98b954EedeAC495271d0F

# Split the flow across two scripts (e.g. two DAO votes)
ens:register mydao @me 1y --secret @hash("my registration secret") --step only-commit
ens:register mydao @me 1y --secret @hash("my registration secret") --step only-reveal
```

## Notes

- Since ENSv2 (mainnet, 2026-10-27) names are registered with the
  ETHRegistrar: ENS v1's registration is frozen. The name is an ENSv2 name,
  owned in the ETHRegistry with the roles a registration gives (set
  subregistry, set resolver, transfer).
- Registration is a commit/reveal flow. By default the command emits the
  commit transaction, a real-time wait for the registrar's minimum
  commitment age (60s, plus a small margin), and the reveal. In fork
  simulations the wait is instant — the fork's clock is warped instead.
- `--step` selects which part runs: `commit-wait-reveal` (default),
  `only-commit`, `only-reveal`, `only-commit-and-wait`,
  `only-wait-and-reveal`. All steps must use identical arguments and
  `--secret`, otherwise the reveal won't find the commitment.
- The reveal is paid in an ERC-20 from the sender: USDC by default, or DAI
  with `--payment-token`; the registrar takes no ETH. The price is quoted
  when the script is built, and the sender approves the registrar for it
  first when its allowance is short.
- A registration lasts 28 days at least.
- No resolver is set unless `--resolver` names one, and an ENSv2
  registration sets no primary name: `--reverse-record` stops with an error.

## See Also

- [@ens:available](../helpers/available.md) — check availability first
