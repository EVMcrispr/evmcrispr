---
title: Zero-Knowledge Proofs with circom
experimental: true
---

The `circom` module compiles a circuit, sets it up, proves it and verifies
the proof, all from a script. The verifier snarkjs generates is a contract
like any other: `contracts` compiles and deploys it, and a contract of yours
can consume the proof in the same transaction that submits it.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## A circuit, inline

A circuit is a heredoc. The one below proves knowledge of the preimage of a
public Poseidon commitment: the `secret` stays private, the `commitment` is
a public signal.

```evml
load circom

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

print "constraints:" @circom:constraints($circuit)
```

`include` paths are version-pinned npm paths, fetched and verified against
the package's published integrity hash; an unpinned path is refused. The
constraint count tells you which powers-of-tau file the circuit needs.

## Setup: dev versus real

`--ptau dev` runs a throwaway groth16 setup in place: fine for development,
never for production, since whoever ran it could forge proofs. A real
deployment proves from artifacts produced by a ceremony, or uses plonk, whose
setup is deterministic and only needs a real ptau:

```evml novalidate
# Production groth16: artifacts from a ceremony, pinned by content
circom:prove $proof --wasm ipfs://<wasm-cid> --zkey ipfs://<zkey-cid> --inputs [secret:$secret commitment:$commitment]

# plonk: no ceremony, deterministic setup from a real ptau
circom:prove $proof --circom $circuit --system plonk --inputs [secret:$secret commitment:$commitment]
```

The rest of this guide uses the dev setup so that everything runs from one
script.

## Prove

Inputs are named. The secret is a random field element, the commitment its
Poseidon hash, computed by the same helpers the circuit uses, so the proof
verifies by construction. `@circom:proof` destructures the proof JSON into
the tuple the verifier contract takes, and `@circom:verify` checks it
off-chain against the verification key of the same setup.

```evml
load circom

set $circuit <<<CIRCOM
pragma circom 2.0.0;
include "circomlib@2.0.5/circuits/poseidon.circom";
template Member() {
    signal input secret;
    signal input commitment;
    component h = Poseidon(1);
    h.inputs[0] <== secret;
    h.out === commitment;
}
component main {public [commitment]} = Member();
CIRCOM

set $secret @circom:field.rand()
set $commitment @circom:poseidon($secret)
circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
set [$a $b $c $signals] @circom:proof($proof)

print "valid off-chain:" @circom:verify($proof @circom:vkey($circuit ptau:dev))
```

## Verify on-chain

`@circom:verifier` returns the Solidity source of the verifier for the
circuit and its setup. `@contracts:solidity` compiles it and
`contracts:deploy` puts it on the current chain; a read through `@get`
confirms the proof there.

```evml
load circom
load contracts

set $circuit <<<CIRCOM
pragma circom 2.0.0;
include "circomlib@2.0.5/circuits/poseidon.circom";
template Member() {
    signal input secret;
    signal input commitment;
    component h = Poseidon(1);
    h.inputs[0] <== secret;
    h.out === commitment;
}
component main {public [commitment]} = Member();
CIRCOM

contracts:deploy $verifier @contracts:solidity(@circom:verifier($circuit ptau:dev))

set $secret @circom:field.rand()
set $commitment @circom:poseidon($secret)
circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
set [$a $b $c $signals] @circom:proof($proof)
print "valid on-chain:" @get($verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])(bool)" $a $b $c $signals)
```

## A contract that consumes the proof

A verifier alone only answers true or false. The contract below admits
whoever proves membership: it pins the commitment at deployment, asks the
verifier, and records the caller. The commitment is public; the secret never
leaves the script.

```evml
load circom
load contracts

set $circuit <<<CIRCOM
pragma circom 2.0.0;
include "circomlib@2.0.5/circuits/poseidon.circom";
template Member() {
    signal input secret;
    signal input commitment;
    component h = Poseidon(1);
    h.inputs[0] <== secret;
    h.out === commitment;
}
component main {public [commitment]} = Member();
CIRCOM

contracts:deploy $verifier @contracts:solidity(@circom:verifier($circuit ptau:dev))

set $gateSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
interface IVerifier {
  function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b,
    uint256[2] calldata c, uint256[1] calldata signals) external view returns (bool);
}
/// Admits whoever proves knowledge of the committed secret.
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
}
SOL

set $secret @circom:field.rand()
set $commitment @circom:poseidon($secret)
contracts:deploy $gate @contracts:solidity($gateSrc contract:Gate) --constructor "constructor(address,uint256)" --constructor-args [$verifier $commitment]

circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
set [$a $b $c $signals] @circom:proof($proof)
exec $gate "admit(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
assert $gate::{admitted(address)(bool) @me} == true "admission failed"

# Publish the source on the chain's explorer, from the same heredoc
contracts:verify $gate --source $gateSrc --contract-name Gate --constructor "constructor(address,uint256)" --constructor-args [$verifier $commitment]
```

## Try it in a fork

Nothing above depends on a particular chain. Wrap the same steps in
`sim:fork` to run them against a fork of the chain you are on, gas-free:

```evml novalidate
load sim
load circom
load contracts

sim:fork (
  contracts:deploy $verifier @contracts:solidity(@circom:verifier($circuit ptau:dev))
  contracts:deploy $gate @contracts:solidity($gateSrc contract:Gate) --constructor "constructor(address,uint256)" --constructor-args [$verifier $commitment]
  circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
  set [$a $b $c $signals] @circom:proof($proof)
  exec $gate "admit(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
  assert $gate::{admitted(address)(bool) @me} == true "admission failed"
)
```

## The rest of the toolbox

The module also ships the primitives circuits are built from, so a script
can prepare inputs and witnesses without leaving EVML:

```evml
load circom

# Field elements: reduce a hash into the field, or draw a random one
set $msg @circom:field(@hash("vote for 42"))

# Poseidon over any number of inputs
print "commitment:" @circom:poseidon(@circom:field.rand() 42)

# Poseidon Merkle trees: root, membership proof, verification
set $members [1234 5678 9012]
set $root @circom:tree.root($members)
print "member 1 is in:" @circom:tree.verify($root 5678 1 @circom:tree.proof($members 1))

# EdDSA over Baby Jubjub
set $sig @circom:eddsa.sign("my secret seed" $msg)
print "signature valid:" @circom:eddsa.verify($msg $sig @circom:eddsa.pub("my secret seed"))
```

See the [circom reference](/reference/circom/) for every helper and option.

## Combining with EEZ

A gate like the one above admits on L1. On an EEZ L2 a contract can trust
that gate's face there, so proving on L1 mints on L2 in the same
transaction. The [EEZ guide](/guides/eez/#combining-with-circom)
shows that composition.
