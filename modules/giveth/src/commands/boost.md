---
title: "giveth:boost"
---

Allocate your GIVpower across Giveth projects by percentage. With --with (or no option) it replaces your entire existing allocation; with --by it changes the listed projects by percentage points and the rest of your allocation absorbs the difference proportionally. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and updates the allocation through the Giveth API; no transaction is sent, so it cannot be batched, and inside sim:fork the update is only logged, never sent.

## Syntax

```evml
giveth:boost <projects>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `projects` | `array \| giveth-project` | Giveth project URL slugs |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--with` | `array` | GIVpower percentage per project, matching <projects> and summing to 100; replaces your entire allocation. Defaults to an equal split |
| `--by` | `array` | Percentage-point change per project (e.g. [20 -20]), matching <projects>; the net change is absorbed proportionally by your other boosted projects |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Boost two projects 70/30
giveth:boost [evmcrispr wayback-machine] --with [70 30]

# Split your GIVpower evenly across three projects
giveth:boost [evmcrispr wayback-machine the-giveth-community-of-makers]

# Move 20 percentage points from wayback-machine to evmcrispr,
# leaving the rest of your allocation untouched
giveth:boost [evmcrispr wayback-machine] --by [20 -20]

# Give a project 10 more percentage points; every other boosted
# project shrinks proportionally to make room
giveth:boost [evmcrispr] --by [10]
```

## How it works

Boosting is not an on-chain operation: Giveth stores boost allocations in its
backend and recomputes project ranks from them every GIVbacks round. The
command signs you in to Giveth with a Sign-In-With-Ethereum message (one
wallet signature per run) and calls the `setMultiplePowerBoosting` API with
the resolved project ids.

With `--with` (or no option) the call **replaces your whole allocation**: any
project you previously boosted but leave out of `<projects>` drops to 0%, and
the percentages must sum to 100. Read the current allocation first with
[@giveth:boostedBy](../helpers/boostedBy.md).

With `--by` the listed projects are **shifted by percentage points** relative
to your current allocation. If the changes sum to 0 every other boosted
project keeps its share; otherwise the rest of your allocation shrinks (net
increase) or grows (net decrease) proportionally to absorb the difference. A
project not boosted yet starts from 0%, a project reduced to exactly 0% is
dropped, reducing a project below 0% fails, and a net increase larger than
what the other projects hold fails.

Giveth accepts at most 20 boosted projects, percentages use 2 decimals, and
the account needs staked GIV for the boost to carry weight (see
[giveth:stake](stake.md)).

## See Also

- [@giveth:boostedBy](../helpers/boostedBy.md)
- [@giveth:givpower](../helpers/givpower.md)
- [giveth:stake](stake.md)
- [giveth:lock](lock.md)
