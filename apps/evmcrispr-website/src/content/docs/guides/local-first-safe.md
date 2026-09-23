---
title: Safe Transactions from Files
description: Export, exchange, and import Safe transaction JSON with the CLI, terminal files, and IPFS.
experimental: true
---

The [Safe guide](safe.md#work-without-the-safe-api) explains how to prepare,
sign, merge, and execute Safe transactions as JSON without the Safe
Transaction Service. This guide covers moving that JSON between owners:
saving them to files, piping them into the CLI, loading them in the terminal,
and sharing them over IPFS.

The same EVML runs in the terminal and with `evmcrispr run workflow.evml`.
The Safe module is experimental; the CLI accepts `--experimental`. No wallet
is needed to prepare unsigned transactions, inspect them, merge
signatures, or exchange files. Addresses below are placeholders.

## Export a Safe transaction

Only `print` writes to stdout. Status messages and signing hashes go to
stderr, so the printed JSON can be redirected straight into a file. Save
this script as `prepare.evml`:

```evml
load safe

set $safe 0x1111111111111111111111111111111111111111
safe:propose-offline $tx $safe (
  send 0x2222222222222222222222222222222222222222 --value 1
)
print $tx
```

```sh
evmcrispr --experimental run prepare.evml > transaction.json
```

Print only the Safe transaction when exporting a JSON file. Several `print` commands
produce consecutive outputs, not a single JSON document.

In the terminal, **Download output** saves the same printed text. Name the
downloaded file `transaction.json`.

## Import a Safe transaction

Scripts read input with `@fetch(stdin:)`. EVML cannot read filesystem paths or
`file:` URLs, so the host always supplies the data:

- **CLI:** pipe the file into the command, for example
  `cat transaction.json | evmcrispr --experimental run sign.evml`. Input comes
  from the shell, independently of the script file. `evmcrispr run -` instead
  reads the script itself from stdin, so it cannot also supply data.
- **Terminal:** use **Choose input file** before running. The input stays in
  memory and is not uploaded or saved.
- **Terminal link:** pass URL-encoded text in the `?stdin=` parameter. In a
  hash link, it goes after the script path.

Simulation uses the same supplied input.

## Sign from the CLI

This script signs the Safe transaction it receives and prints the signed JSON:

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $tx @fetch(stdin:)
print @safe:verify($safe $tx)
safe:confirm-offline $tx $safe $tx
print $tx
```

The CLI uses an external signing provider:

```sh
cat transaction.json | evmcrispr --experimental run sign.evml --wallet-rpc http://127.0.0.1:8545 --account 0x1111111111111111111111111111111111111111 > signed.json
```

Use an account controlled by that wallet endpoint. The terminal uses its
connected wallet instead. RPC reads use the `EVMCRISPR_RPC_URL` and per-chain
settings in the CLI, and the chain configuration in the terminal.

## Combine signed Safe transactions

To execute, supply the signed Safe transactions as one JSON array. The shell can
assemble it with `jq`, or you can select an equivalent file in the terminal:

```sh
jq -s . owner-a.json owner-b.json | evmcrispr --experimental run execute.evml
```

```evml
load safe
load http [@fetch]

set $safe 0x1111111111111111111111111111111111111111
set $input @fetch(stdin:)
set $tx @safe:merge(@http:json($input "[0]") @http:json($input "[1]"))
print @http:json(@safe:verify($safe $tx) readiness)
safe:execute $safe $tx
```

## Drafts and sharing

Drafts are ordinary files. Keep them wherever the owners already exchange
documents, and feed them back in with the import methods above. To share a
Safe transaction by CID, use `@ipfs` and `@ipfs.get`. Uploading currently uses Pinata
and is optional; local files need no pinning service.

Deleting a file does not cancel anything. A Safe transaction stays executable
until its nonce is used, and an on-chain `approveHash` approval stays in place.
To cancel one, see [the Safe guide](safe.md#cancel-a-safe-transaction).
