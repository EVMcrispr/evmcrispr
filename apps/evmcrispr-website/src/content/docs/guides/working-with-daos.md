---
title: Working with DAOs
---

EVMcrispr provides the `aragonos` module for interacting with Aragon DAOs.
This guide covers the most common DAO operations.

## Connecting to a DAO

Use `aragonos:connect` to establish a DAO context. All DAO commands run
inside the connect block:

```evml
load aragonos [grant @app]

aragonos:connect my-dao.aragonid.eth (
  # DAO commands go here
  grant CREATE_VOTES_ROLE on @app(voting) to @me
)
```

You can connect by ENS name or by address:

```evml
load aragonos [@app]

aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  print @app(agent)
)
```

Loading a module makes its commands and helpers available in their
qualified form (`aragonos:grant`, `@aragonos:app(...)`). To use them
without the prefix, name them in the `load` line's import list:
`load aragonos [grant @app]` imports the `grant` command and the `@app`
helper for unqualified use. The import list is the only thing that decides
what an unqualified name means — a block never changes name resolution, so
a module update can never silently redefine a name you didn't import.
DAO commands still only *work* inside a `connect` block (they need the DAO
context) — every snippet below is therefore wrapped in its `connect` block.

## Managing Permissions

### Granting Roles

```evml
load aragonos [grant @app]

aragonos:connect my-dao.aragonid.eth (
  # Grant a role to the connected wallet
  grant CREATE_VOTES_ROLE on @app(voting) to @me

  # Grant with a specific permission manager
  grant MINT_ROLE on @app(token-manager) to @app(voting) @app(voting)

  # Grant with an oracle contract
  grant CREATE_PAYMENTS_ROLE on @app(finance) to @app(voting) --oracle 0x44fA8E6f47987339850636F88629646662444217
)
```

### Revoking Roles

```evml
load aragonos [revoke @app]

aragonos:connect my-dao.aragonid.eth (
  # Revoke a permission
  revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(voting)

  # Revoke and remove the permission manager
  revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(voting) true
)
```

## Installing Apps

```evml
load aragonos [install grant]

aragonos:connect my-dao.aragonid.eth (
  # Install a new agent app
  install $agent agent

  # Install with initialization parameters
  install $tm token-manager @token(ANT) false 1e18

  # Install a specific version
  install $vault vault --version 2.0.0

  # Use the installed app
  grant MINT_ROLE on $tm to @me
)
```

## Upgrading Apps

```evml
load aragonos [upgrade]

aragonos:connect my-dao.aragonid.eth (
  # Upgrade to the latest version
  upgrade token-manager.aragonpm.eth

  # Upgrade to a specific implementation address
  upgrade token-manager.aragonpm.eth 0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9
)
```

## Executing Through an Agent

Use `act` to call external contracts through the DAO's agent:

```evml
load aragonos [act @app]
load token

aragonos:connect my-dao.aragonid.eth (
  # Transfer tokens from the DAO treasury
  act @app(agent) @token(DAI) "transfer(address,uint256)" @me @token:amount(DAI 100)
)
```

## Forwarding Through Governance

Use `forward` to route actions through voting or other forwarder apps:

```evml
load aragonos [forward grant @app]

aragonos:connect my-dao.aragonid.eth (
  forward @app(voting) (
    grant CREATE_PAYMENTS_ROLE on @app(finance) to @app(voting) @app(voting)
  ) --context "Add payment permission"
)
```

## Resolving App Addresses

```evml
load aragonos [@app]

aragonos:connect my-dao.aragonid.eth (
  # Get the address of a DAO app
  set $agent @app(agent)

  # With index for multiple instances (0 = first)
  set $agent2 @app(agent 1)
)
```

To reference apps from another DAO, use sequential `connect` blocks — variables
set inside a block persist after it ends:

```evml
load aragonos [@app]

aragonos:connect other-dao.aragonid.eth (
  set $otherAgent @app(agent)
)

aragonos:connect my-dao.aragonid.eth (
  exec $otherAgent "transfer(address,address,uint256)" @token(ANT) @me 1e18
)
```

## Creating DAOs

```evml
load aragonos

# Create a new DAO
aragonos:new-dao $dao "my-new-dao"

# Create a token for the DAO, controlled by the connected wallet
aragonos:new-token $token "My Token" "MTK" @me
```

## Combining with Simulation

Test DAO operations before executing them on-chain:

```evml
load aragonos [grant install @app]
load sim

sim:fork (
  aragonos:connect my-dao.aragonid.eth (
    grant CREATE_VOTES_ROLE on @app(voting) to @me
    install $agent agent
    sim:expect @bool($agent != 0x0000000000000000000000000000000000000000)
  )
)
```
