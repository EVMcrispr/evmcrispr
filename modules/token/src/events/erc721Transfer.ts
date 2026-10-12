import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "erc721Transfer",
  description: "ERC-721 transfers: who owns each token that moved.",
  event:
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  suggest: async (env, { emitter, logs }) => {
    const collection = await contract(env, emitter, "token");
    const last = new Map<bigint, string>();
    for (const { to, tokenId } of logs) last.set(tokenId, to);
    const out = [];
    for (const [tokenId, address] of last) {
      const owner = account(address, "owner");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function ownerOf(uint256) view returns (address)",
            args: [tokenId],
            expect: owner.address,
          },
          line`assert ${collection}::!{ownerOf(uint256)(address) ${tokenId}} == ${owner}`,
          say`Token #${tokenId} in ${collection} is owned by ${owner}`,
        )),
      );
    }
    return out;
  },
});
