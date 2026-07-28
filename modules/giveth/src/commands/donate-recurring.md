---
title: "giveth:donate-recurring"
experimental: true
sidebar:
  label: "giveth:donate-recurring ⚗️"
---

Start, adjust, or stop a recurring Giveth donation: a Superfluid stream of the token to the anchor contract of the project (Optimism and Base only), recorded in the Giveth database. `total` sets the absolute rate (0 stops the donation), `more`/`less` adjust an existing one by a delta. The token is the underlying (use @token(SYM); the zero address streams the native SuperToken) or a SuperToken address; --wrap converts underlying into the SuperToken first. Signs you in to Giveth (SIWE) and sends the transactions immediately, so it cannot be batched.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
giveth:donate-recurring <rate> <token> <mode> <to> <project>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `rate` | `number` | Flow rate in wei per second — use a rate literal like 100e18/mo |
| `token` | `address` | Token to stream: underlying token, its SuperToken, or the zero address for the native token |
| `mode` | `command` | Keyword `total` (set the absolute rate; 0 stops), `more` or `less` (adjust the existing stream by <rate>) |
| `to` | `command` | Keyword `to` |
| `project` | `giveth-project` | Giveth project URL slug |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--wrap` | `number` | Amount of underlying token (base units) to wrap into the SuperToken before streaming |
| `--tip` | `number` | Extra stream to Giveth itself as a percentage of <rate> (0-100), added on top (only with `total`) |
| `--anonymous` | `bool` | Hide your identity on the recorded donation |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Start donating 100 DAI per month, wrapping a year's worth into DAIx
switch optimism
giveth:donate-recurring 100e18/mo @token(DAI) total to evmcrispr --wrap 1200e18

# Add a 5% tip stream to Giveth on top
switch optimism
giveth:donate-recurring 100e18/mo @token(DAI) total to evmcrispr --tip 5

# Increase an existing donation by 10 DAI per month
switch optimism
giveth:donate-recurring 10e18/mo @token(DAI) more to evmcrispr

# Decrease it by 20 DAI per month
switch optimism
giveth:donate-recurring 20e18/mo @token(DAI) less to evmcrispr

# Stop the donation
switch optimism
giveth:donate-recurring 0 @token(DAI) total to evmcrispr

# Stream the native token (ETHx on Optimism and Base)
switch base
giveth:donate-recurring 0.1e18/mo @token(ETH) total to evmcrispr --wrap 1.2e18
```

## How it works

A recurring donation is a Superfluid constant-flow stream to the project's
**anchor contract** (see [@giveth:anchor](../helpers/anchor.md)) — but a bare
stream is invisible to Giveth: nothing indexes the chain, so the command must
also report every change to Giveth's API (`createRecurringDonation` /
`updateRecurringDonationParams`), keyed on the underlying token's symbol.
That report needs the transaction hash and an authenticated user, so the
command signs you in with a Sign-In-With-Ethereum message, executes the
transactions immediately, and records the stream with the resulting hash —
which is why it cannot go inside `batch` or a Safe. Inside `sim:fork` the
transactions simulate on the fork and the sign-in and database recording are
skipped.

The flow rate is set with the CFAv1Forwarder's `setFlowrate`, which
transparently creates, updates, or (at rate 0) deletes the flow. `more` and
`less` read the current rate first and apply the delta; `less` down to
exactly zero stops the donation. Because rate-ness is erased at runtime, the
`<rate>` position always means wei per second — rate literals like
`100e18/mo` evaluate to exactly that, and variables or `@num(...)` results
work the same.

Streams need the SuperToken (DAIx, not DAI) and enough balance to cover the
CFA's deposit buffer. `--wrap <amount>` approves and upgrades that much
underlying into the SuperToken first (`upgradeByETH` for the native token);
without it the command checks your SuperToken balance against the buffer and
fails early with a hint. Wrapping can also be done separately with
`superfluid:wrap`.

`--tip` opens a second, additive stream to the Giveth project's own anchor:
repeating a `total` with `--tip` tops up the existing tip stream rather than
replacing it, and stopping a project donation leaves the tip stream alone —
stop it like any other recurring donation:
`giveth:donate-recurring 0 @token(DAI) total to the-giveth-community-of-makers`.

## See Also

- [giveth:donate](donate.md)
- [@giveth:anchor](../helpers/anchor.md)
- [@giveth:project](../helpers/project.md)
