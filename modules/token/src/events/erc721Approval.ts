import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "erc721Approval",
  description: "ERC-721 approvals: who may move each token.",
  event:
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  suggest: async (env, { emitter, logs }) => {
    const collection = await contract(env, emitter, "token");
    const last = new Map<bigint, string>();
    for (const { approved, tokenId } of logs) last.set(tokenId, approved);
    const out = [];
    for (const [tokenId, address] of last) {
      const approved = account(address, "approved");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function getApproved(uint256) view returns (address)",
            args: [tokenId],
            expect: approved.address,
          },
          line`assert ${collection}::!{getApproved(uint256)(address) ${tokenId}} == ${approved}`,
          say`Token #${tokenId} in ${collection} may be moved by ${approved}`,
        )),
      );
    }
    return out;
  },
});
