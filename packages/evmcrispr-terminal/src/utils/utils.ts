import { providers } from "ethers";
import { EVMcrispr } from "@1hive/evmcrispr";
import { sponsors } from "../assets/sponsors.json";

async function dao(code: string, provider: providers.Web3Provider) {
  let [, dao, _path, , , context] =
    code
      .split("\n")[0]
      .match(/^connect ([\w.-]+)(( [\w.\-:]+)*)( @context:(.+))?$/) ?? [];
  console.log(dao, _path, context);
  if (!dao || !_path) {
    console.log(dao, _path);
    throw new Error("First line must be `connect <dao> <...path>`");
  }
  const path = _path
    .trim()
    .split(" ")
    .map((id) => id.trim());
  const _code = code.split("\n").slice(1).join("\n");
  const evmcrispr = await EVMcrispr.create(dao, provider.getSigner() as any, {
    ipfsGateway: "https://ipfs.blossom.software/ipfs/",
  });
  return { dao, path, context, _code, evmcrispr };
}

function client(chainId: number) {
  return {
    1: "client.aragon.org",
    4: "rinkeby.client.aragon.org",
    100: "aragon.1hive.org",
  }[chainId];
}

function network(ethereum: { chainId: string }): providers.Network | undefined {
  return {
    1: {
      name: "mainnet",
      chainId: 1,
      ensAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    },
    4: {
      name: "rinkeby",
      chainId: 4,
      ensAddress: "0x98Df287B6C145399Aaa709692c8D308357bC085D",
    },
    100: {
      name: "xdai",
      chainId: 100,
      ensAddress: "0xaafca6b0c89521752e559650206d7c925fd0e530",
    },
  }[Number(ethereum.chainId)];
}

function parsedSponsors() {
  switch (sponsors.length) {
    case 1:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>`;
    case 2:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a> and <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>`;
    case 3:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>, <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>, and <a href="${sponsors[2][1]}">${sponsors[2][0]}</a>`;
    default:
      return "";
  }
}

export { dao, client, network, parsedSponsors };
