const ANVIL_URL = "http://127.0.0.1:8545";
const FORK_BLOCK_NUMBER = 34630239;

export async function resetAnvil() {
  await fetch(ANVIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "anvil_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ARCHIVE_NODE_ENDPOINT,
            blockNumber: FORK_BLOCK_NUMBER,
          },
        },
      ],
      id: 1,
    }),
  });
}
