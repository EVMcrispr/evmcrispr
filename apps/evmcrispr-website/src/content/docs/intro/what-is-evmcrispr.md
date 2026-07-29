---
title: How EVMcrispr Works
---

By now you have written a script and picked a surface to run it on. This
page explains what actually happens in between — the mental model that
makes the rest of the documentation easier to navigate.

## A Script Becomes Transactions

Running a script goes through three steps:

1. **Parse & validate** — the script is checked for syntax and semantic
   errors before anything touches the chain. This is what powers the
   editor's inline diagnostics and the CLI's `validate` command.
2. **Interpret** — commands run in order, resolving helpers like
   `@token(DAI)` against live chain state and collecting *actions*
   (transaction descriptors). Nothing is signed or sent yet.
3. **Execute** — the collected actions are handed to your wallet for
   signing, one transaction per action (or one for a whole
   [batch](/language/blocks-and-batching/)).

The separation between interpreting and executing is what makes
[simulation](/guides/simulation/) possible: the same actions can be sent to
a forked chain instead of your wallet, so you see balances change and
assertions pass before spending any gas. It is also why the terminal can
show you exactly what will be executed before you sign anything.

## Commands Produce Actions, Helpers Produce Values

The two building blocks you've been using divide the work cleanly:

- **Commands** (`exec`, `batch`, `aragonos:grant`, …) produce actions or
  control the flow of the script. They are the only things that can end up
  as transactions.
- **Helpers** (`@token(DAI)`, `@get(...)`, `@me`, …) produce values —
  resolving symbols, reading contract state, doing arithmetic. They never
  produce transactions themselves.

That means you can always tell what a script *does to the chain* by
reading its command lines; helpers only decide the values those commands
use.

## Modules

The core language is deliberately small; capabilities come from
**modules**. `std` (always loaded) provides `exec`, `set`, `print`, and
friends. Other modules add protocol-specific commands — `aragonos` for
Aragon DAOs, `sim` for simulation, `ens` for name management, and more:

```evml
load ens [renew]

renew "myname" 1y
```

A module's commands encapsulate the multi-call choreography a protocol
needs (approvals, encoding, forwarding paths), so one script line can
stand for several carefully-ordered contract calls. Every module's
commands and helpers are documented in the [Reference](/reference/std/)
section, and [Modules & Imports](/language/modules/) explains how loading
and name resolution work.

## Why Scripts?

- **Reviewable** — a script is a readable, shareable description of an
  on-chain operation; the whole proposal fits in a chat message.
- **Atomic** — batching turns multi-step operations into all-or-nothing
  transactions.
- **Testable** — simulation and assertions let you verify the outcome
  before executing.
- **Repeatable** — parameterize with variables, reuse with `def`, and run
  the same operation across chains with `switch`.

## Next Steps

- [The EVML Language](/language/syntax/) — the full language manual
- [Simulation](/guides/simulation/) — put the interpret/execute split to work
- [Sharing Scripts](/guides/sharing-scripts/) — hand a reviewable script to someone else
