import { ErrorException, type Module } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { getAddress } from "viem";
import { CORS_PROXY_PREFIX, GIVETH_GRAPHQL_URL } from "../addresses";

export interface GivethProject {
  id: number;
  slug: string;
  addresses: {
    address: string;
    networkId: number;
    isRecipient: boolean;
    chainType: string;
  }[];
  anchorContracts: {
    address: string;
    networkId: number;
    isActive: boolean;
  }[];
}

export async function postGraphql(
  _module: Module,
  query: string,
  variables: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await fetch(CORS_PROXY_PREFIX + GIVETH_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json() as Promise<any>);
  if (res?.errors?.length) {
    throw new ErrorException(`Giveth API error: ${res.errors[0].message}`);
  }
  return res?.data;
}

const PROJECT_QUERY = `
query GetProject($slug: String!) {
  projectBySlug(slug: $slug) {
    id
    slug
    addresses {
      address
      networkId
      isRecipient
      chainType
    }
    anchorContracts {
      address
      networkId
      isActive
    }
  }
}
`;

export async function fetchProject(
  module: Module,
  slug: string,
): Promise<GivethProject> {
  const data = await postGraphql(module, PROJECT_QUERY, { slug });
  const project = data?.projectBySlug;
  if (!project) {
    throw new ErrorException("Project not found");
  }
  return {
    ...project,
    id: Number(project.id),
    addresses: project.addresses ?? [],
    anchorContracts: project.anchorContracts ?? [],
  };
}

export function getRecipientAddress(
  project: GivethProject,
  chainId: number,
): Address {
  const entry = project.addresses.find(
    (a) => a.networkId === chainId && a.isRecipient && a.chainType === "EVM",
  );
  if (!entry) {
    throw new ErrorException("Project doesn't have an address on this chain");
  }
  return getAddress(entry.address);
}

export function getAnchor(project: GivethProject, chainId: number): Address {
  const entry = project.anchorContracts.find(
    (a) => a.networkId === chainId && a.isActive,
  );
  if (!entry) {
    throw new ErrorException(
      "Project doesn't have an anchor contract on this chain (recurring donations are only available on Optimism and Base)",
    );
  }
  return getAddress(entry.address);
}

const USER_QUERY = `
query GetUser($address: String!) {
  userByAddress(address: $address) {
    id
  }
}
`;

/** Giveth user id for a wallet address, or undefined for unknown accounts. */
export async function fetchUserId(
  module: Module,
  address: string,
): Promise<number | undefined> {
  const data = await postGraphql(module, USER_QUERY, { address });
  const id = data?.userByAddress?.id;
  return id == null ? undefined : Number(id);
}

const BOOSTINGS_QUERY = `
query GetPowerBoosting($userId: Int!) {
  getPowerBoosting(userId: $userId, take: 25) {
    powerBoostings {
      percentage
      project {
        id
        slug
      }
    }
  }
}
`;

export interface PowerBoosting {
  percentage: number;
  project: { id: number; slug: string };
}

export async function fetchPowerBoostings(
  module: Module,
  userId: number,
): Promise<PowerBoosting[]> {
  const data = await postGraphql(module, BOOSTINGS_QUERY, { userId });
  const boostings = data?.getPowerBoosting?.powerBoostings ?? [];
  return boostings.map((b: any) => ({
    percentage: b.percentage,
    project: { id: Number(b.project?.id), slug: b.project?.slug },
  }));
}

// The production impact-graph takes flat args (the input-object form is the
// separate v6 backend) and returns the donation id as a bare Float.
const CREATE_DONATION_MUTATION = `
mutation CreateDonation($transactionId: String, $transactionNetworkId: Float!, $amount: Float!, $token: String!, $projectId: Float!, $tokenAddress: String, $anonymous: Boolean, $useDonationBox: Boolean, $relevantDonationTxHash: String) {
  createDonation(transactionId: $transactionId, transactionNetworkId: $transactionNetworkId, amount: $amount, token: $token, projectId: $projectId, tokenAddress: $tokenAddress, anonymous: $anonymous, useDonationBox: $useDonationBox, relevantDonationTxHash: $relevantDonationTxHash)
}
`;

export interface DonationRecord {
  txHash: string;
  chainId: number;
  /** Human units (not wei) — the API stores donation amounts as floats. */
  amount: number;
  tokenSymbol: string;
  tokenAddress: Address;
  projectId: number;
  anonymous: boolean;
  useDonationBox?: boolean;
  relevantDonationTxHash?: string;
}

/** Persist a sent donation in Giveth's database (requires a SIWE JWT). */
export async function recordDonation(
  module: Module,
  jwt: string,
  record: DonationRecord,
): Promise<number> {
  const data = await postGraphql(
    module,
    CREATE_DONATION_MUTATION,
    {
      transactionId: record.txHash,
      transactionNetworkId: record.chainId,
      amount: record.amount,
      token: record.tokenSymbol,
      projectId: record.projectId,
      tokenAddress: record.tokenAddress,
      anonymous: record.anonymous,
      useDonationBox: record.useDonationBox,
      relevantDonationTxHash: record.relevantDonationTxHash,
    },
    { Authorization: `Bearer ${jwt}`, authVersion: "2" },
  );
  const id = data?.createDonation;
  if (id == null) {
    throw new ErrorException("Giveth didn't confirm the donation record");
  }
  return Number(id);
}

const SET_BOOSTINGS_MUTATION = `
mutation SetMultiplePowerBoosting($projectIds: [Int!]!, $percentages: [Float!]!) {
  setMultiplePowerBoosting(projectIds: $projectIds, percentages: $percentages) {
    id
  }
}
`;

export async function setPowerBoostings(
  module: Module,
  jwt: string,
  projectIds: number[],
  percentages: number[],
): Promise<void> {
  const data = await postGraphql(
    module,
    SET_BOOSTINGS_MUTATION,
    { projectIds, percentages },
    { Authorization: `Bearer ${jwt}`, authVersion: "2" },
  );
  if (!data?.setMultiplePowerBoosting) {
    throw new ErrorException("Giveth didn't confirm the boost update");
  }
}
