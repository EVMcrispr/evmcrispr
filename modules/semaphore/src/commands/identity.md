---
title: "semaphore:identity"
---

Derive a Semaphore v4 identity and bind its public commitment to <variable>. The connected wallet signs a fixed message and the signature seeds the identity - deterministic per wallet, recoverable anywhere by re-signing. The secret never leaves module memory.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
semaphore:identity <variable>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the identity commitment to |

<!-- HAND-WRITTEN -->

## Identity custody

The identity secret lives only in module memory for the session — it is
never bound to a variable, so scripts stay safe to print and share. The
seed is the wallet's `personal_sign` signature over a fixed message:
deterministic per wallet (ECDSA uses RFC 6979 nonces), so the same wallet
re-derives the same identity on any device by re-signing. There is
deliberately no way to pass a seed in a script — a seed in script text is
a leaked secret.

## Why identities need an EOA

The scheme relies on one property: the same wallet always produces
byte-identical signatures for the fixed message. EOAs guarantee this
(RFC 6979 deterministic nonces). Smart-contract wallets (ERC-1271)
structurally don't:

- A threshold-k Safe signature concatenates *k of n* owner signatures —
  which owners sign varies per session, so the bytes (and therefore the
  derived identity) would silently differ each time.
- Rotating a smart wallet's owners — the point of smart wallets — changes
  the signing keys, making the identity underivable afterwards. A
  Semaphore identity is a leaf in a group tree: losing its secret means
  losing the ability to prove membership, permanently.
- Passkey (WebAuthn) signatures embed counters and are not byte-stable,
  and some ERC-1271 flows return no signature bytes to the app at all.

The limitation is narrower than it sounds: **only the identity needs an
EOA**. The identity wallet never appears on-chain, needs no funds, and
doesn't have to send any transaction — a Safe can still create groups,
add members and validate proofs, while its owner's EOA holds the
identity. For smart-wallet-only setups the ecosystem answer is a random
identity with user-managed backup, which this module deliberately doesn't
offer in scripts: a secret that must be written down is a secret that
ends up in script text.

## Examples

```evml
load semaphore

# One-time: derive your identity (the wallet signs a fixed message)
semaphore:identity $me

# Group admin
semaphore:create-group $group
semaphore:add-member $me to $group

# Anonymous signal: prove membership, nullified per scope
semaphore:prove $proof --group $group --message "approve proposal 42" --scope 42
semaphore:validate $proof for $group
```

## See Also

- [semaphore:prove](prove.md) — uses the stored identity
