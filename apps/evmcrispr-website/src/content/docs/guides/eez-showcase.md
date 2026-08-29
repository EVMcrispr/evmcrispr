---
title: EEZ showcase
---


A walkthrough of what EVMcrispr can do on an EEZ rollup pair: prove
something in zero knowledge, admit yourself on L1, and let an L1 contract
mint a badge on the rollup — in one atomic transaction — with every contract
compiled, deployed and verified inline. It runs unchanged as
`test/integration/demo.test.ts` against the EEZ devnet.

```evml
load eez
load circom
load contracts

# ── 1. L1: a ZK gate ─────────────────────────────────────────────
switch eezL1
eez:faucet @me

set $circuit <<<CIRCOM
pragma circom 2.0.0;
include "circomlib@2.0.5/circuits/poseidon.circom";
// Prove you know the preimage of a public commitment.
template Member() {
    signal input secret;
    signal input commitment;
    component h = Poseidon(1);
    h.inputs[0] <== secret;
    h.out === commitment;
}
component main {public [commitment]} = Member();
CIRCOM

# Groth16 verifier, generated from the circuit and deployed right here
contracts:deploy $verifier @contracts:solidity(@circom:verifier($circuit ptau:dev))

set $gateSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
interface IVerifier {
  function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b,
    uint256[2] calldata c, uint256[1] calldata signals) external view returns (bool);
}
interface IBadge { function mint(address to) external; }
/// Admits whoever proves membership; can hand out badges on the rollup.
contract Gate {
  IVerifier public immutable verifier;
  uint256 public immutable commitment;
  mapping(address => bool) public admitted;
  constructor(IVerifier v, uint256 c) { verifier = v; commitment = c; }
  function admit(uint256[2] calldata a, uint256[2][2] calldata b,
      uint256[2] calldata c, uint256[1] calldata signals) external {
    require(signals[0] == commitment && verifier.verifyProof(a, b, c, signals), "bad proof");
    admitted[msg.sender] = true;
  }
  /// `badge` is the L1 face of the rollup's Badge: this call runs on the
  /// rollup, atomically, inside this same transaction.
  function mintBadge(IBadge badge) external {
    require(admitted[msg.sender], "not admitted");
    badge.mint(msg.sender);
  }
}
SOL

set $secret @circom:field.rand()
set $commitment @circom:poseidon($secret)
contracts:deploy $gate @contracts:solidity($gateSrc contract:Gate) --constructor "constructor(address,uint256)" --constructor-args [$verifier $commitment]
contracts:verify $gate --source $gateSrc --contract-name Gate --constructor "constructor(address,uint256)" --constructor-args [$verifier $commitment]

# Prove, admit, and assert the L1 fact
circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
set [$a $b $c $signals] @circom:proof($proof)
exec $gate "admit(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
assert $gate::{admitted(address)(bool) @me} == true "admission failed"

# ── 2. Rollup: a badge only the L1 Gate may mint ────────────────
switch eezL2
eez:faucet @me

set $badgeSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Badge {
  address public immutable gate;                 // the Gate's face on this rollup
  mapping(address => uint256) public balanceOf;
  constructor(address g) { gate = g; }
  function mint(address to) external { require(msg.sender == gate, "only gate"); balanceOf[to] += 1; }
}
SOL
# The Gate lives on eezL1; its face on this rollup is deterministic.
contracts:deploy $badge @contracts:solidity($badgeSrc) --constructor "constructor(address)" --constructor-args [@eez:proxy(eezL1 $gate)]
contracts:verify $badge --source $badgeSrc --constructor "constructor(address)" --constructor-args [@eez:proxy(eezL1 $gate)]
eez:proxy $gate                               # create that face so the callback resolves

# ── 3. L1 → rollup, atomically ──────────────────────────────────
switch eezL1
eez:proxy $badge                              # the Badge's face on L1
exec $gate mintBadge(address) @eez:proxy(eezL2 $badge)

# Read the rollup from L1
set $badges @eez:on(eezL2 $badge::{balanceOf(address)(uint256) @me})
print "badges on the rollup:" $badges
```

What it exercises:

- **circom** — a Poseidon-commitment circuit compiled inline, a dev setup,
  a Groth16 proof, and the snarkjs-exported verifier compiled by `contracts`
  and deployed like any other contract.
- **contracts** — inline Solidity compiled with `@contracts:solidity`,
  deployed with constructor arguments, and verified on the chain's own
  Blockscout from the same source (`contracts:verify --source`).
- **eez** — deterministic proxies used as constructor arguments before they
  exist (`@eez:proxy`), created on demand (`eez:proxy`), a local contract
  calling across with a plain `exec` (the EEZ RPC routes it), and a
  read of the other chain from the script (`@eez:on`).
- **std** — `assert` running through the Assertions core deployed on the
  EEZ chains, `exec`, destructuring of the proof tuple.

Once the on-chain face of `@eez:on` exists, the last read becomes an
assertion evaluated synchronously on L1 against rollup state:

```evml novalidate
assert @eez:on!(eezL2 $badge::{balanceOf(address)(uint256) @me}) == 1 "badge not minted"
```
