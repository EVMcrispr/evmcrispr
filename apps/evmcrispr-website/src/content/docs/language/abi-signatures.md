---
title: ABI Signatures
---

Contract function signatures follow Solidity syntax. Inside a signature
string the parameter types **are** comma-separated, exactly as in Solidity:

```evml
# Write functions (for exec): inputs only
exec @token(DAI) "transfer(address,uint256)" @me 100e18
exec @token(DAI) "approve(address,uint256)" @me 100e18

# Read functions (for @get): append (returnTypes) directly after the inputs
set $bal @get(@token(DAI) "balanceOf(address)(uint256)" @me)
set $name @get(@token(DAI) "name()(string)")
set $reserves @get(0x44fA8E6f47987339850636F88629646662444217 "getReserves()(uint112,uint112,uint32)")
```

The read format is `"name(inputTypes)(returnTypes)"` — two parenthesized
lists back to back with **no colon or other separator** between them
(`"name()(string)"`, not `"name():(string)"`).

## Inline Calls

A read signature can also be embedded directly in an inline call: write
the target address, the `::` operator, and the signature with its
arguments inside braces — no quotes, arguments space-separated after the
signature:

```evml
print "Balance: " @token(DAI)::{balanceOf(address)(uint256) @me}
```

This is an expression form of `@get` — it performs the same read-only
call and can be used anywhere a value is expected:

```evml
set $reserves 0x44fA8E6f47987339850636F88629646662444217::{getReserves()(uint112,uint112,uint32)}
```

Inline calls chain: when a call returns an address, append another
`::{...}` to call into it directly:

```evml
load ens

set $registry 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
set $node @ens:namehash("vitalik.eth")

print "Address:" $registry::{resolver(bytes32)(address) $node}::{addr(bytes32)(address) $node}
```

## Next Steps

- [Event & Error Captures](captures.md) — decode events and reverts from calls
- [Syntax](syntax.md) — commands, helpers, and options
