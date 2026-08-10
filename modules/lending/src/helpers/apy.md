---
title: "@lending:apy"
---

Current APY of a lending-market reserve as a decimal fraction (2.04% is 0.0204), compounded the way the protocol accrues. Pass `supply` for the deposit rate or `borrow` for the variable borrow rate.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@lending:apy(token side adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Reserve token to inspect (use @token(SYM)) |
| `side` | `string` | `supply` for the deposit rate, `borrow` for the borrow rate |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print the WXDAI deposit APY (0.02 means 2%)
print "WXDAI supply APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d supply)

# Print the variable borrow APY
print "WXDAI borrow APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d borrow)
```

<!-- HAND-WRITTEN -->

## On-chain face (@apy!)

The market, the protocol and the reserve listing are composition-time
facts: which adapter answers comes from its address book, the sim-mode
filter and a `getReserveData` check, none of which the chain can decide
mid-batch. What defers is the rate itself.

The compounding is the same computation as the plain face, expressed in
operands: one unit plus the per-period rate, raised to the number of
periods in fixed point, minus the unit. Aave quotes an annualized ray
rate, so it divides down to per-second first; Comet quotes per second
already, in wad, and reaches its rate through a live utilization read.
The result carries the protocol's own scale, so `>= 0.05` compares
against 5e25 on a ray market rather than rounding to nothing.

Being readable off-chain does not imply being expressible on-chain, so
an adapter declares the two capabilities separately. Where a rate has no
composition the adapter omits the slot and the face names the protocol
that cannot do it, instead of quietly meaning something else.

## See Also
