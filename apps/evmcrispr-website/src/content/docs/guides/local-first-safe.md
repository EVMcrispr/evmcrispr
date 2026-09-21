---
title: Local-first Safe workflows
description: Prepare, review, sign, exchange and execute Safe packages with the same EVML in the terminal and CLI.
---

Safe's experimental local-first workflow uses your configured RPC without the
Safe Transaction Service. Enable experimental modules in your host; the CLI
accepts `--experimental`. The same EVML runs in the terminal or with
`evmcrispr run workflow.evml`. No wallet is required to prepare unsigned
transactions, inspect packages, merge signatures, or exchange files.

## Prepare and export

Use explicit addresses and function signatures to avoid optional metadata or
name-resolution services. The nonce defaults to the current on-chain nonce.

```evml
load safe
set $mySafe 0x1111111111111111111111111111111111111111
safe:propose $mySafe (
  send 0x2222222222222222222222222222222222222222 --value 1
) --no-api true --unsigned true --as $tx
print $tx
```

Save this as `prepare.evml` and redirect its printed package:

```sh
evmcrispr --experimental run prepare.evml > transaction.json
```

Only `print` goes to stdout; status messages and signing hashes go to stderr.
In the terminal, use **Download output** to save the same printed text, then
name the downloaded file `transaction.json`. Use **Choose input file** before
execution to supply a file's contents to `@fetch(stdin:)`; this input stays in
memory and is not uploaded or saved by the terminal. Alternatively, pass
URL-encoded text in the terminal URL's `?stdin=` parameter (after the script
path in a hash link). Simulation uses the same supplied input.
EVML cannot read filesystem paths or `file:` URLs. The CLI receives input from
the shell, independently of the script file. `run -` instead consumes stdin as
EVML source, so it cannot also supply data input.

## Review and sign independently

```evml
load safe
load http [@fetch]
set $mySafe 0x1111111111111111111111111111111111111111
set $tx @fetch(stdin:)
safe:verify $mySafe $tx --no-api true --as $review
sign $signature --typed @http:json($review typedData)
set $signed @safe:merge($tx $signature)
print $signed
```

Review the complete transaction, including unknown calldata, value, operation,
refunds and nonce. Hash consistency does not establish intent. Verification
never fetches an ABI; `--abi` accepts an address-to-ABI JSON mapping for local
decoding. `--offline true` performs no network calls and leaves current-owner,
threshold, approval and contract-signature checks explicitly unchecked.

The CLI's signing provider is external:

```sh
cat transaction.json | evmcrispr --experimental run sign.evml --wallet-rpc http://127.0.0.1:8545 --account 0x1111111111111111111111111111111111111111 > signed.json
```

Use an account controlled by that wallet endpoint. The terminal uses its
connected wallet. RPC reads use existing `EVMCRISPR_RPC_URL`/per-chain settings
in the CLI and the terminal's chain configuration.

## Merge and execute

```evml
load safe
load http [@fetch]
set $mySafe 0x1111111111111111111111111111111111111111
set $input @fetch(stdin:)
set $first @http:json($input "[0]")
set $second @http:json($input "[1]")
set $tx @safe:merge($first $second)
safe:verify $mySafe $tx --no-api true --as $review
print @http:json($review readiness)
safe:execute $mySafe $tx --no-api true
```

Supply multiple packages as a JSON array. For example, the shell can assemble
one with `jq`, or you can select an equivalent JSON file in the terminal:

```sh
jq -s . owner-a.json owner-b.json | evmcrispr --experimental run execute.evml
```

Anyone may relay a sufficiently authorized package. Execution rechecks current
state and checks Safe's success/failure event, not only the outer receipt.
`ready` checks signatures and nonce; execution can still fail for insufficient
funds, a guard, or the underlying call.

## Nested Safe owners and approvals

For each owner Safe, prepare a message using the parent report's exact
`signingBytes`, sign its typed data, and attach the signed message:

```evml novalidate
safe:verify-message $ownerSafe @http:json($review signingBytes) --format bytes --offline true --as $messageReview
sign $signature --typed @http:json($messageReview typedData)
set $signedMessage @safe:merge(@http:json($messageReview package) $signature)
set $tx @safe:merge($tx $signedMessage)
```

Collect enough signatures for the owner Safe before attaching it. Online
verification checks its current authorization through the contract.

For on-chain approval, use the ordinary contract-call command from an owner:

```evml novalidate
exec $mySafe approveHash(bytes32) @http:json($review hashes.safeTxHash)
```

A nested Safe owner can include that call in its own Safe transaction block.
Execution automatically discovers confirmed approvals. Approvals are not
removed when a local package or draft is deleted.

## Drafts, sharing and replacement

Save drafts as ordinary files. Pipe their contents into the CLI or explicitly
select an input file in the terminal, then access them with `@fetch(stdin:)`.
Existing `@ipfs` and `@ipfs.get` can exchange package text by CID; upload
currently uses Pinata and is optional. Local files need no pinning service.
Print only the package when exporting a JSON file: multiple `print` commands
produce consecutive outputs, not a single JSON document.

To replace or cancel an unexecuted transaction, prepare a zero-value transfer
to the Safe itself with `--nonce` set to the original nonce, then collect fresh
signatures. Only one transaction at that nonce can execute. Old files are not
automatically deleted; a consumed nonce alone cannot identify which proposal
executed.
