---
title: Working with DAOs
---

EVMcrispr provides the `aragonos` module for interacting with Aragon DAOs.
This guide covers the most common DAO operations.

## Connecting to a DAO

Use `connect` to establish a DAO context. All DAO commands run inside the
connect block:

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # DAO commands go here
  grant @me @app(voting) CREATE_VOTES_ROLE
)
```

You can connect by ENS name or by address:

```evml
load aragonos

aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  print @app(agent)
)
```

Inside a `connect` block, aragonos commands (`grant`, `install`, `revoke`,
`act`, …) and the `@app()` helper are used without the `aragonos:` prefix.
Outside of one they do not exist — every snippet below is therefore wrapped
in its `connect` block.

## Managing Permissions

### Granting Roles

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # Grant a role to the connected wallet
  grant @me @app(voting) CREATE_VOTES_ROLE

  # Grant with a specific permission manager
  grant @app(voting) @app(token-manager) MINT_ROLE @app(voting)

  # Grant with an oracle contract
  grant @app(voting) @app(finance) CREATE_PAYMENTS_ROLE --oracle 0x44fA8E6f47987339850636F88629646662444217
)
```

### Revoking Roles

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # Revoke a permission
  revoke @app(voting) @app(acl) CREATE_PERMISSIONS_ROLE

  # Revoke and remove the permission manager
  revoke @app(voting) @app(acl) CREATE_PERMISSIONS_ROLE true
)
```

## Installing Apps

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # Install a new agent app
  install $agent agent:new-app

  # Install with initialization parameters
  install $tm token-manager:new-app @token(ANT) false 1e18

  # Install a specific version
  install $vault vault:new-app --version 2.0.0

  # Use the installed app
  grant @me $tm MINT_ROLE
)
```

## Upgrading Apps

```evml
load aragonos

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
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # Transfer tokens from the DAO treasury
  act @app(agent) @token(DAI) "transfer(address,uint256)" @me @token.amount(DAI 100)
)
```

## Forwarding Through Governance

Use `forward` to route actions through voting or other forwarder apps:

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  forward @app(voting) (
    grant @app(voting) @app(finance) CREATE_PAYMENTS_ROLE @app(voting)
  ) --context "Add payment permission"
)
```

## Resolving App Addresses

```evml
load aragonos

aragonos:connect my-dao.aragonid.eth (
  # Get the address of a DAO app
  set $agent @app(agent)

  # With index for multiple instances
  set $agent2 @app(agent:1)

  # Cross-DAO reference: dao:app
  set $otherAgent @app(other-dao.aragonid.eth:agent)
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
load aragonos
load sim

sim:fork (
  aragonos:connect my-dao.aragonid.eth (
    grant @me @app(voting) CREATE_VOTES_ROLE
    install $agent agent:new
    sim:expect @bool(@app(agent:1) != 0x0000000000000000000000000000000000000000)
  )
)
```
