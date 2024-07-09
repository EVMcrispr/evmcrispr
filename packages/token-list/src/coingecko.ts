type Network = {
  id: string;
  chain_identifier: number | null;
  name: string;
  shortname: string;
  native_coin_id: string;
};

export async function getNetworkName(
  chainId: number,
): Promise<{ name: string; id: string }> {
  const networks: Network[] = await fetch(
    "https://api.coingecko.com/api/v3/asset_platforms",
  ).then((res) => res.json());
  const network = networks.find(
    (network) => network.chain_identifier === chainId,
  );
  if (!network) {
    throw {
      status: 404,
      body: "Network not found",
    };
  }
  return { name: network.name, id: network.id };
}
