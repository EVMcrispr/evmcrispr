import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript, isTransactionAction } from "@evmcrispr/core";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import type { Address, Hex, WalletClient } from "viem";
import { createWalletClient, http, parseAbi } from "viem";
import {
  type ActionHandlerCtx,
  makeDefaultHandlers,
} from "../../../../packages/core/src/evml/execute";
import {
  devnet,
  ensureFunded,
  L1_ID,
  L1_RPC,
  L2_ID,
  L2_RPC,
  l1Chain,
  l2,
  l2Chain,
  testAccount,
} from "../devnet";

/**
 * The showcase script: prove membership in zero knowledge, admit yourself
 * on L1, and let an L1 contract mint a badge on the rollup — atomically —
 * with every contract compiled, deployed and verified inline. See the
 * module README for the narrated version.
 */
const DEMO = `load eez
load circom
load contracts

switch eezL1

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
interface IBadge { function mint(address to) external; }
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

circom:prove $proof --circom $circuit --ptau dev --inputs [secret:$secret commitment:$commitment]
set [$a $b $c $signals] @circom:proof($proof)
exec $gate "admit(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
assert $gate::{admitted(address)(bool) @me} == true "admission failed"

switch eezL2

set $badgeSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Badge {
  address public immutable gate;
  mapping(address => uint256) public balanceOf;
  constructor(address g) { gate = g; }
  function mint(address to) external { require(msg.sender == gate, "only gate"); balanceOf[to] += 1; }
}
SOL
contracts:deploy $badge @contracts:solidity($badgeSrc) --constructor "constructor(address)" --constructor-args [@eez:proxy($gate rollup:0)]
contracts:verify $badge --source $badgeSrc --constructor "constructor(address)" --constructor-args [@eez:proxy($gate rollup:0)]
eez:proxy $gate

switch eezL1
eez:proxy $badge
exec $gate mintBadge(address) @eez:proxy($badge)

set $badges @eez:on(eezL2 $badge::{balanceOf(address)(uint256) @me})
print "badges on the rollup:" $badges
`;

const badgeAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

describe.skipIf(!devnet)(
  "Eez > demo: ZK gate on L1, badge on the rollup",
  () => {
    beforeAll(async () => {
      await ensureFunded();
    }, 120_000);

    it("runs the whole showcase script end to end", async () => {
      const wallets: Record<number, WalletClient> = {
        [L1_ID]: createWalletClient({
          account: testAccount,
          chain: l1Chain,
          transport: http(L1_RPC),
        }),
        [L2_ID]: createWalletClient({
          account: testAccount,
          chain: l2Chain,
          transport: http(L2_RPC),
        }),
      };
      const defaults = makeDefaultHandlers({
        account: testAccount.address,
        maximizeGasLimit: false,
      });
      // A local key is bound to one RPC: pick the wallet by the action's
      // chain, and let `switch` pass without a wallet round-trip.
      const routed = (ctx: ActionHandlerCtx, chainId?: number) => ({
        ...ctx,
        walletClient: wallets[chainId ?? L1_ID] ?? ctx.walletClient,
      });

      const logs: string[] = [];
      const result = await executeScript(
        DEMO,
        evml.registry,
        {
          chainId: L1_ID,
          transports: getTransports(),
          account: testAccount.address,
        },
        wallets[L1_ID],
        {
          prepareChains: false,
          onLog: (m) => logs.push(m),
          handlers: {
            wallet: async (action, ctx) =>
              action.method === "wallet_switchEthereumChain"
                ? undefined
                : ctx.next(action),
            transaction: (action, ctx) =>
              defaults.transaction(action, routed(ctx, action.chainId)),
          },
        },
      );

      const sent = result.executed.filter(
        (e) => isTransactionAction(e.action) && !e.action.readOnly,
      );
      // verifier, gate, admit | badge, gate-proxy | badge-proxy, mintBadge
      expect(sent.length).to.be.gte(7);
      for (const { result: receipt } of sent) {
        expect((receipt as any).status).to.equal("success");
      }
      // Module and `print` output lands in the script's own log stream;
      // `onLog` only carries the executor's status lines.
      const log = [...result.logs, ...logs].join("\n");
      expect(log).to.include("Pass - Verified");
      expect(log).to.match(/badges on the rollup:\s*1\b/);

      // Belt and braces: read the badge straight from the rollup.
      const badge = /Badge.*?(0x[0-9a-fA-F]{40})/.exec(log)?.[1];
      if (badge) {
        const balance = await l2.readContract({
          address: badge as Address,
          abi: badgeAbi,
          functionName: "balanceOf",
          args: [testAccount.address as Hex],
        });
        expect(balance).to.equal(1n);
      }
    }, 600_000);
  },
);
