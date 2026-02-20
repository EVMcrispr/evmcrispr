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
            jsonRpcUrl: `https://lb.drpc.live/gnosis/${process.env.VITE_DRPC_API_KEY}`,
            blockNumber: FORK_BLOCK_NUMBER,
          },
        },
      ],
      id: 1,
    }),
  });
}
