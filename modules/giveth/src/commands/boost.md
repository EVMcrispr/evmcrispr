---
title: "giveth:boost"
---

Allocate your GIVpower across Giveth projects by percentage. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and replaces your entire existing boost allocation through the Giveth API; no transaction is sent, so it cannot be batched or simulated.

## Syntax

```evml
giveth:boost <projects>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `projects` | `array` | Giveth project URL slugs |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--with` | `array` | GIVpower percentage per project, matching <projects> and summing to 100; defaults to an equal split |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Boost two projects 70/30
giveth:boost [evmcrispr wayback-machine] --with [70 30]

# Split your GIVpower evenly across three projects
giveth:boost [evmcrispr wayback-machine the-giveth-community-of-makers]
```

## How it works

Boosting is not an on-chain operation: Giveth stores boost allocations in its
backend and recomputes project ranks from them every GIVbacks round. The
command signs you in to Giveth with a Sign-In-With-Ethereum message (one
wallet signature per run) and calls the `setMultiplePowerBoosting` API with
the resolved project ids.

The call **replaces your whole allocation**: any project you previously
boosted but leave out of `<projects>` drops to 0%. Read the current
allocation first with [@giveth:boostedBy](../helpers/boostedBy.md). Giveth
accepts at most 20 boosted projects, percentages use 2 decimals, and the
account needs staked GIV for the boost to carry weight (see
[giveth:stake](stake.md)).

## See Also

- [@giveth:boostedBy](../helpers/boostedBy.md)
- [@giveth:givpower](../helpers/givpower.md)
- [giveth:stake](stake.md)
- [giveth:lock](lock.md)
