import fs from "fs";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-gas-reporter";

import { task, HardhatUserConfig } from "hardhat/config";
import { HttpNetworkUserConfig } from "hardhat/types";

const DEBUG = false;

//
// Select the network you want to deploy to here:
//
const defaultNetwork = "hardhat";

function mnemonic() {
  try {
    return fs.readFileSync("./mnemonic.txt").toString().trim();
  } catch (e) {
    if (defaultNetwork !== "hardhat") {
      console.log(
        "☢️ WARNING: No mnemonic file created for a deploy account. Try `yarn run generate` and then `yarn run account`."
      );
    }
  }
  return "";
}

const config: HardhatUserConfig = {
  defaultNetwork,

  // don't forget to set your provider like:
  // REACT_APP_PROVIDER=https://dai.poa.network in packages/react-app/.env
  // (then your frontend will talk to your contracts on the live network!)
  // (you will need to restart the `yarn run start` dev server after editing the .env)

  solidity: {
    compilers: [
      {
        version: "0.4.24",
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 0,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  networks: {
    hardhat: {
      gas: 10_000_000,
      // Rinkeby
      // gasPrice: 8000000000,
      // Mainnet
      gasPrice: 24927821531,
      allowUnlimitedContractSize: true,
      forking: {
        // url: "https://speedy-nodes-nyc.moralis.io/cff107316eaa320c66ca9c51/eth/rinkeby/archive",
        // blockNumber: 10316339,
        // url: "https://speedy-nodes-nyc.moralis.io/cff107316eaa320c66ca9c51/eth/mainnet/archive",
        // blockNumber: 14378816,
        url: "https://xdai-archive.blockscout.com",
        blockNumber: 21953949,
      },
    },
    localhost: {
      url: "http://localhost:8545",
      timeout: 0,
      /*
        notice no mnemonic here? it will just use account 0 of the hardhat node to deploy
        (you can put in a mnemonic here to set the deployer locally)
      */
    },
    coverage: {
      url: "http://localhost:8555",
      allowUnlimitedContractSize: true,
    },
    rinkeby: {
      url: "https://rinkeby.infura.io/v3/fb8cf9d97ab44df7b4a268b282c04803", // <---- YOUR INFURA ID! (or it won't work)
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    kovan: {
      url: "https://kovan.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad", // <---- YOUR INFURA ID! (or it won't work)
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    mainnet: {
      url: "https://mainnet.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad", // <---- YOUR INFURA ID! (or it won't work)
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    ropsten: {
      url: "https://ropsten.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad", // <---- YOUR INFURA ID! (or it won't work)
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    goerli: {
      url: "https://goerli.infura.io/v3/460f40a260564ac4a4f4b3fffb032dad", // <---- YOUR INFURA ID! (or it won't work)
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    xdai: {
      url: "https://xdai.poanetwork.dev/",
      gasPrice: 1000000000,
      accounts: {
        mnemonic: mnemonic(),
      },
      forking: {
        url: "https://xdai-archive.blockscout.com",
        blockNumber: 15627460,
      },
    },
    matic: {
      url: "https://rpc-mainnet.maticvigil.com/",
      gasPrice: 1000000000,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
  },
};

task("account", "Get balance informations for the deployment account.", async (_, { ethers }) => {
  const hdkey = require("ethereumjs-wallet/hdkey");
  const bip39 = require("bip39");
  const mnemonic = fs.readFileSync("./mnemonic.txt").toString().trim();
  if (DEBUG) console.log("mnemonic", mnemonic);
  const seed = await bip39.mnemonicToSeed(mnemonic);
  if (DEBUG) console.log("seed", seed);
  const hdwallet = hdkey.fromMasterSeed(seed);
  const wallet_hdpath = "m/44'/60'/0'/0/";
  const account_index = 0;
  const fullPath = wallet_hdpath + account_index;
  if (DEBUG) console.log("fullPath", fullPath);
  const wallet = hdwallet.derivePath(fullPath).getWallet();
  const privateKey = "0x" + wallet._privKey.toString("hex");
  if (DEBUG) console.log("privateKey", privateKey);
  const EthUtil = require("ethereumjs-util");
  const address = "0x" + EthUtil.privateToAddress(wallet._privKey).toString("hex");

  const qrcode = require("qrcode-terminal");
  qrcode.generate(address);
  console.log("‍📬 Deployer Account is " + address);
  for (const n in config.networks) {
    // console.log(config.networks[n],n)
    try {
      const provider = new ethers.providers.JsonRpcProvider((config.networks[n] as HttpNetworkUserConfig).url);
      const balance = await provider.getBalance(address);
      console.log(" -- " + n + " --  -- -- 📡 ");
      console.log("   balance: " + ethers.utils.formatEther(balance));
      console.log("   nonce: " + (await provider.getTransactionCount(address)));
    } catch (e) {
      if (DEBUG) {
        console.log(e);
      }
    }
  }
});
task("accounts", "Prints the list of accounts", async (_, { ethers }) => {
  const accounts = await ethers.provider.listAccounts();
  accounts.forEach((account) => console.log(account));
});

export default config;
