import {
  fetchArtifact,
  fullProve,
  leanProof,
  loadPoseidon2,
  parseFieldInput,
} from "@evmcrispr/module-zk";
import { BindingsSpace, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { getGroupMembers } from "../utils/members";
import {
  artifactUrls,
  buildProofJson,
  hashSignal,
  packPoints,
  parseSignalValue,
} from "../utils/proof";
import { parseGroupId, readSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  name: "prove",
  description:
    "Prove membership in a Semaphore group anonymously, signaling a message nullified per scope, and bind the proof JSON to <variable>. Uses the production ceremony artifacts for the group's tree depth. Requires an identity derived this session (semaphore:identity).",
  batchable: false,
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the proof JSON to",
    },
  ],
  opts: [
    {
      name: "group",
      type: "number",
      description: "Group id to prove membership in",
    },
    {
      name: "message",
      type: "any",
      description: "Message (number, hex or string) the proof signals",
    },
    {
      name: "scope",
      type: "any",
      description:
        "Scope (external nullifier) — one accepted proof per identity per scope",
    },
    {
      name: "identity",
      type: "number",
      description:
        "Identity commitment to prove with (default: the only identity of this session)",
    },
  ],
  async run(module, { variable }, { opts }) {
    const missing = ["group", "message", "scope"].filter(
      (name) => opts[name] === undefined,
    );
    if (missing.length) {
      throw new ErrorException(
        `semaphore:prove: ${missing.map((name) => `--${name}`).join(", ")} ${missing.length > 1 ? "are" : "is"} required`,
      );
    }
    const groupId = parseGroupId(opts.group);
    const rawMessage = parseSignalValue(opts.message, "message");
    const rawScope = parseSignalValue(opts.scope, "scope");
    const identity = module.requireIdentity(
      opts.identity !== undefined
        ? parseFieldInput(opts.identity, "identity")
        : undefined,
    );

    const checkAborted = () => {
      if (module.context.signal?.aborted) {
        throw new ErrorException("semaphore:prove: aborted");
      }
    };
    const ctx = {
      log: (message: string) => module.context.log(message),
      fetchIpfs: (cidPath: string) => module.ipfsResolver.bytes(cidPath),
    };

    checkAborted();
    const h = await loadPoseidon2();
    const members = await getGroupMembers(module, groupId, h);
    const index = members.indexOf(identity.commitment);
    if (index === -1) {
      throw new ErrorException(
        `semaphore: commitment ${identity.commitment} is not a member of group ${groupId}`,
      );
    }
    const { pathIndex, siblings } = leanProof(members, index, h);
    const depth = Math.max(
      Number(await readSemaphore(module, "getMerkleTreeDepth", [groupId])),
      1,
    );
    const paddedSiblings = [
      ...siblings,
      ...Array.from({ length: depth - siblings.length }, () => 0n),
    ];

    checkAborted();
    const urls = artifactUrls(depth);
    module.context.log(
      `semaphore: fetching the depth-${depth} ceremony artifacts (first use only)…`,
    );
    const [wasm, zkey] = await Promise.all([
      fetchArtifact(urls.wasm, "semaphore wasm", ctx),
      fetchArtifact(urls.zkey, "semaphore zkey", ctx),
    ]);

    checkAborted();
    module.context.log("semaphore: generating the membership proof…");
    const hashedMessage = hashSignal(rawMessage);
    const hashedScope = hashSignal(rawScope);
    let proof: Record<string, unknown>;
    let publicSignals: string[];
    try {
      ({ proof, publicSignals } = await fullProve(
        "groth16",
        {
          secret: identity.secretScalar.toString(),
          merkleProofLength: siblings.length.toString(),
          merkleProofIndex: pathIndex.toString(),
          merkleProofSiblings: paddedSiblings.map(String),
          message: hashedMessage.toString(),
          scope: hashedScope.toString(),
        },
        wasm,
        zkey,
      ));
    } catch (err) {
      throw new ErrorException(
        `semaphore:prove: proving failed — ${(err as Error).message ?? err}`,
      );
    }

    // Sanity: the circuit outputs [merkleRoot, nullifier] — they must match
    // the reconstructed tree and the locally derived nullifier.
    const expectedNullifier = h(hashedScope, identity.secretScalar);
    if (
      BigInt(publicSignals[0]) !== (await readRoot(module, groupId)) ||
      BigInt(publicSignals[1]) !== expectedNullifier
    ) {
      throw new ErrorException(
        "semaphore:prove: proof public signals do not match the group state — retry (the group may have changed mid-proof)",
      );
    }

    checkAborted();
    module.bindingsManager.setBinding(
      variable,
      buildProofJson({
        merkleTreeDepth: BigInt(depth),
        merkleTreeRoot: BigInt(publicSignals[0]),
        nullifier: BigInt(publicSignals[1]),
        message: rawMessage,
        scope: rawScope,
        points: packPoints(proof),
      }),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    module.context.log(":success: semaphore: membership proof generated");
    return [];
  },
});

async function readRoot(module: Semaphore, groupId: bigint): Promise<bigint> {
  return readSemaphore(module, "getMerkleTreeRoot", [groupId]);
}
