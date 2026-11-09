import { decode, getCodec } from "@ensdomains/content-hash";
import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeFunctionResult,
  encodeFunctionData,
  getChainContractAddress,
  type Hex,
  parseAbi,
  toHex,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import type Ens from "..";
import { EMPTY_DYNAMIC_RETURN, universalResolverRead } from "../onchain";
import { ensClient, getNode } from "../utils";

const contenthashAbi = parseAbi([
  "function contenthash(bytes32 node) view returns (bytes)",
]);
const universalResolverAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
]);

export default defineHelper<Ens>({
  name: "contenthash.of",
  batchable: false,
  description: "Read the decoded content hash of an ENS name (e.g. ipfs://…).",
  compileDescription:
    "Mainnet only; reads the raw content hash bytes (compare against @ens:contenthash) rather than the decoded URI, and a missing record reads as empty bytes.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  // Read through the Universal Resolver, as viem reads addr and text. Since
  // ENS v2 the resolver it names for a v1 name is its bridge
  // (ENSV1Resolver), which answers `resolve(name, data)` only: asking it
  // for `contenthash(node)` directly reverted for every v1 name.
  async run(module, { name }, { node }) {
    const call = encodeFunctionData({
      abi: contenthashAbi,
      functionName: "contenthash",
      args: [getNode(name)],
    });
    let data: Hex;
    try {
      [data] = await (await ensClient(module)).readContract({
        address: getChainContractAddress({
          chain: mainnet,
          contract: "ensUniversalResolver",
        }),
        abi: universalResolverAbi,
        functionName: "resolve",
        args: [toHex(packetToBytes(normalize(name))), call],
      });
    } catch (err) {
      // A revert is the Universal Resolver saying the name does not
      // resolve; anything else (the network) is not that.
      if (
        err instanceof BaseError &&
        err.walk((e) => e instanceof ContractFunctionRevertedError)
      ) {
        throw new HelperFunctionError(node, `no resolver found for ${name}`);
      }
      throw err;
    }
    const contenthash = decodeFunctionResult({
      abi: contenthashAbi,
      functionName: "contenthash",
      data,
    });
    if (!contenthash || contenthash === "0x") {
      throw new HelperFunctionError(node, `no content hash found for ${name}`);
    }
    const encoded = contenthash.slice(2);
    return `${getCodec(encoded)}://${decode(encoded)}`;
  },
  // The face reads the raw multicodec bytes the resolver holds; the
  // decoded `codec://hash` form is an off-chain rendering. The plain
  // @ens:contenthash encoder produces the same raw bytes from a URI, so
  // the two compose: assert @ens:contenthash.of!(x) == @ens:contenthash(u).
  compile: async (ctx, node) => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    return universalResolverRead(
      ctx,
      name,
      encodeFunctionData({
        abi: contenthashAbi,
        functionName: "contenthash",
        args: [getNode(name)],
      }),
      EMPTY_DYNAMIC_RETURN,
      "Bytes",
    );
  },
});
