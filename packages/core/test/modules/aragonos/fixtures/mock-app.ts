import { toDecimals } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { namehash, toHex } from "viem";
import { DAO } from "../../../fixtures";

type App = {
  appName: string;
  codeAddress: Address;
  initializeSignature: string;
  initializeParams: any[];
  initializeUnresolvedParams: any[];
  callSignature: string;
  callSignatureParams: any[];
  callSignatureUnresolvedParams: any[];
  actTarget: Address;
  actSignature: string;
  actSignatureParams: any[];
  actSignatureUnresolvedParams: any[];
  get appIdentifier(): keyof typeof DAO;
  get appId(): string;
};

export const APP: App = {
  appName: "token-manager.aragonpm.eth",
  codeAddress: "0x714c925ede405687752c4ad32078137c4f179538",
  initializeSignature: "initialize(address,bool,uint256)",
  initializeParams: [
    "0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd",
    false,
    toDecimals(1000),
  ],
  initializeUnresolvedParams: ["agent", false, "1000e18"],
  callSignature: "mint(address,uint256)",
  callSignatureParams: [DAO["disputable-voting.open"], toDecimals(15)],
  callSignatureUnresolvedParams: ["voting", "15e18"],
  actTarget: "0xc778417e063141139fce010982780140aa0cd5ab",
  actSignature: "approve(address[],uint256[][2],bool,bytes,bytes32)",
  actSignatureParams: [
    ["0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd"],
    [
      [toDecimals(1000), 56],
      [String(0.15e8), 4838400],
    ],
    false,
    toHex("hello"),
    toHex("hello", { size: 32 }),
  ],
  actSignatureUnresolvedParams: [
    ["vault"],
    [
      ["1000e18", 56],
      ["0.15e8", "56d"],
    ],
    "false",
    "hello",
    "hello",
  ], // TODO: Change it with an Agent
  get appIdentifier(): keyof typeof DAO {
    return this.appName.split(".")[0] as keyof typeof DAO;
  },
  get appId(): string {
    return namehash(this.appName);
  },
};
