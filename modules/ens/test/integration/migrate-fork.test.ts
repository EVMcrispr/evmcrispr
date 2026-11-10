import "../setup";
import { afterAll, describe, it } from "bun:test";
import { expect, getTransports, resetAnvil } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import {
  createPublicClient,
  getAddress,
  labelhash,
  namehash,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";

/**
 * ENSv2 migration end to end on a mainnet fork, for each kind of ENS v1
 * name: unwrapped, wrapped (unlocked) and locked (CANNOT_UNWRAP burned). Its
 * owner migrates it; it is then REGISTERED on ENSv2 with the same owner and
 * resolver, and the on-chain owner face reads it there.
 *
 * Names migrate on mainnet whenever their owners choose, so none is pinned:
 * each kind takes the first of its candidates still on ENS v1, checked live.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
const NAME_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const CANDIDATES = {
  unwrapped: ["brantly", "coinbase", "vitalik"],
  unlocked: ["sassal"],
  locked: ["museagents", "cerealian"],
} as const;
type Kind = keyof typeof CANDIDATES;

const client = createPublicClient({
  chain: mainnet,
  transport: getTransports()[mainnet.id],
});
const abi = parseAbi([
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function owner(bytes32 node) view returns (address)",
  "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
]);

/** The kind a .eth name is on ENS v1, or undefined once it left ENS v1. */
async function kindOf(label: string): Promise<Kind | undefined> {
  const status = await client.readContract({
    address: ETH_REGISTRY,
    abi,
    functionName: "getStatus",
    args: [BigInt(labelhash(label))],
  });
  if (status !== 1) return undefined; // RESERVED: still on ENS v1
  const node = namehash(`${label}.eth`);
  const owner = await client.readContract({
    address: REGISTRY,
    abi,
    functionName: "owner",
    args: [node],
  });
  if (getAddress(owner) !== getAddress(NAME_WRAPPER)) return "unwrapped";
  const [, fuses] = await client.readContract({
    address: NAME_WRAPPER,
    abi,
    functionName: "getData",
    args: [BigInt(node)],
  });
  if (fuses & 4) return undefined; // CANNOT_TRANSFER: cannot migrate
  return fuses & 1 ? "locked" : "unlocked";
}

async function pick(kind: Kind): Promise<string> {
  for (const label of CANDIDATES[kind])
    if ((await kindOf(label)) === kind) return label;
  throw new Error(
    `no ${kind} ENS v1 name left among ${CANDIDATES[kind].join(", ")}: they migrated; add candidates`,
  );
}

/** The script migrating `label`: its token holder (the BaseRegistrar
 *  registrant, or the NameWrapper holder) migrates it. */
function migration(label: string, kind: Kind) {
  const name = `${label}.eth`;
  const holder =
    kind === "unwrapped"
      ? `@get(${BASE_REGISTRAR} "ownerOf(uint256)(address)" @num(@ens:labelhash("${label}")))`
      : `@get(${NAME_WRAPPER} "ownerOf(uint256)(address)" @num(@ens:namehash("${name}")))`;
  return `load sim
load lang
load ens
sim:fork --using anvil (
  set $holder ${holder}
  set $resolver @get(${REGISTRY} "resolver(bytes32)(address)" @ens:namehash("${name}"))
  sim:set-balance $holder 1e18
  switch --as $holder (
    ens:migrate ${name}
  )
  set $id @num(@ens:labelhash("${label}"))
  sim:expect @bool(@get(${ETH_REGISTRY} "getStatus(uint256)(uint8)" $id) == 2)
  sim:expect @bool(@lang:str.lower(@str(@ens:owner(${name}))) == @lang:str.lower(@str($holder)))
  sim:expect @bool(@lang:str.lower(@str(@ens:resolver(${name}))) == @lang:str.lower(@str($resolver)))
  assert @ens:owner!(${name}) == $holder
)`;
}

describe("Ens > migrate (ENS v1 to ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  for (const kind of ["unwrapped", "unlocked", "locked"] as const) {
    it(`migrates a ${kind} name with its owner and resolver, and the on-chain owner face follows it`, async () => {
      const label = await pick(kind);
      const evm = new Interpreter(evml.registry, {
        account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        transports: getTransports(),
      });
      evm.switchChainId(mainnet.id);
      await evm.interpret(migration(label, kind));
      // Reaching this point means the migration and every expectation held.
      expect(true).to.be.true;
    }, 240_000);
  }
});
