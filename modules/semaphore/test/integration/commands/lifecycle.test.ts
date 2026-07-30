import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { fetchArtifact } from "@evmcrispr/module-zk";
import { type Action, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import { artifactUrls } from "../../../src/utils/proof";

// The full anonymous-signaling loop against the CANONICAL Semaphore v4
// deployment on the gnosis fork, using the real wallet-signature identity
// path. Tests only ever create their own groups, and co-members are plain
// commitment literals — exactly how real scripts receive them. A 3-member
// group has a depth-2 tree; its real ceremony artifacts (~3.5 MB) are
// prewarmed here so the proving cases stay inside their own timeouts.
beforeAll(async () => {
  const urls = artifactUrls(2);
  await Promise.all([
    fetchArtifact(urls.wasm, "semaphore wasm", {}),
    fetchArtifact(urls.zkey, "semaphore zkey", {}),
  ]);
}, 180_000);

// Arbitrary field elements standing in for other members' commitments.
const BOB = "1234567890123456789012345678901234567890";
const CAROL = "9876543210987654321098765432109876543210";

const runScript = async (script: string) => {
  const walletClient = getWalletClients()[0];
  const account = walletClient.account!;
  const evm = new Interpreter(evml.registry, {
    account: account.address,
    transports: getTransports(),
  });
  evm.switchChainId(gnosis.id);
  const actionCallback = async (action: Action) => {
    if (isWalletAction(action) && action.method === "personal_sign") {
      return walletClient.signMessage({ account, message: action.params[0] });
    }
    return undefined;
  };
  await evm.interpret(`load semaphore\n${script}`, actionCallback);
  return evm;
};

const expectScriptError = async (script: string, fragment: string) => {
  let message = "";
  await runScript(script).catch((err) => {
    message = (err as Error).message;
  });
  expect(message, "expected the script to fail").to.include(fragment);
};

const OPEN_FORK = `load sim
load lang
load zk
semaphore:identity $me
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  semaphore:create-group $group
  semaphore:add-member [$me ${BOB} ${CAROL}] to $group`;

describe("Semaphore > commands > lifecycle (create-group / add-member / prove / validate / remove-member)", () => {
  it(
    "creates a group, proves membership with a wallet identity, validates on-chain and removes a member",
    async () => {
      await runScript(`${OPEN_FORK}
  sim:expect @bool(@semaphore:size($group) == 3)
  sim:expect @bool(@semaphore:root($group) == @zk:tree.root(@semaphore:members($group)))
  semaphore:prove $proof --group $group --message "gm anon" --scope "test-poll"
  sim:expect @bool(@semaphore:verify($proof $group))
  sim:expect @bool(@semaphore:nullifier("test-poll" $me) > 0)
  semaphore:validate $proof for $group
  semaphore:remove-member ${BOB} from $group
  sim:expect @bool(@semaphore:size($group) == 3)
  sim:expect @bool(@lang:at(@semaphore:members($group) 1) == 0)
  sim:expect @bool(@semaphore:root($group) == @zk:tree.root(@semaphore:members($group)))
)`);
    },
    { timeout: 120_000 },
  );

  it(
    "rejects a second proof for the same identity and scope (nullifier reuse)",
    async () => {
      await expectScriptError(
        `${OPEN_FORK}
  semaphore:prove $proof --group $group --message 1 --scope 7
  semaphore:validate $proof for $group
  semaphore:prove $again --group $group --message 2 --scope 7
  semaphore:validate $again for $group
)`,
        // The nullifier-reuse revert surfaces as a failed transaction.
        "Transaction failed",
      );
    },
    { timeout: 120_000 },
  );

  it(
    "refuses to prove for a non-member identity",
    async () => {
      await expectScriptError(
        `load sim
semaphore:identity $me
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  semaphore:create-group $group
  semaphore:add-member [${BOB} ${CAROL}] to $group
  semaphore:prove $proof --group $group --message 1 --scope 1
)`,
        "is not a member of group",
      );
    },
    { timeout: 60_000 },
  );

  it("requires an identity for prove", async () => {
    await expectScriptError(
      `load sim
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  semaphore:create-group $group
  semaphore:prove $proof --group $group --message 1 --scope 1
)`,
      "no identity in this session",
    );
  });

  it("refuses to remove a non-member", async () => {
    await expectScriptError(
      `load sim
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  semaphore:create-group $group
  semaphore:add-member ${BOB} to $group
  semaphore:remove-member ${CAROL} from $group
)`,
      "is not a member of group",
    );
  });
});
