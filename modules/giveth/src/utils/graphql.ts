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

/** impact-graph dedup-suffixes slugs (evmcrispr-0, giveth-matching-pool-0)
 *  and resolves the clean spelling via slug history, so strip the suffix
 *  wherever a slug is handed back. */
export function cleanSlug(slug: string): string {
  return slug.replace(/-0$/, "");
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
    slug: cleanSlug(project.slug),
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
    project: {
      id: Number(b.project?.id),
      slug: cleanSlug(b.project?.slug ?? ""),
    },
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

// Recurring donations (Superfluid streams to anchor contracts) have their
// own mutation family; the backend keys a stream on (projectId, networkId,
// currency), where currency is the UNDERLYING token's symbol, and takes the
// flow rate as a wei-per-second string.
const CREATE_RECURRING_DONATION_MUTATION = `
mutation CreateRecurringDonation($projectId: Int!, $networkId: Int!, $txHash: String!, $flowRate: String!, $currency: String!, $anonymous: Boolean, $isBatch: Boolean) {
  createRecurringDonation(projectId: $projectId, networkId: $networkId, txHash: $txHash, flowRate: $flowRate, currency: $currency, anonymous: $anonymous, isBatch: $isBatch) {
    id
  }
}
`;

const UPDATE_RECURRING_DONATION_MUTATION = `
mutation UpdateRecurringDonation($projectId: Int!, $networkId: Int!, $currency: String!, $txHash: String, $flowRate: String, $anonymous: Boolean, $status: String) {
  updateRecurringDonationParams(projectId: $projectId, networkId: $networkId, currency: $currency, txHash: $txHash, flowRate: $flowRate, anonymous: $anonymous, status: $status) {
    id
  }
}
`;

const UPDATE_RECURRING_DONATION_STATUS_MUTATION = `
mutation UpdateRecurringDonationStatus($donationId: Float!, $status: String) {
  updateRecurringDonationStatus(donationId: $donationId, status: $status) {
    id
  }
}
`;

export interface RecurringDonationRecord {
  txHash: string;
  chainId: number;
  /** Flow rate in wei/second. */
  flowRate: bigint;
  /** Underlying token symbol (native currency symbol for ETHx-style tokens). */
  currency: string;
  projectId: number;
  anonymous: boolean;
}

/** Record a new recurring donation; returns its id for status updates. */
export async function createRecurringDonation(
  module: Module,
  jwt: string,
  record: RecurringDonationRecord,
): Promise<number> {
  const data = await postGraphql(
    module,
    CREATE_RECURRING_DONATION_MUTATION,
    {
      projectId: record.projectId,
      networkId: record.chainId,
      txHash: record.txHash,
      flowRate: record.flowRate.toString(),
      currency: record.currency,
      anonymous: record.anonymous,
      isBatch: false,
    },
    { Authorization: `Bearer ${jwt}`, authVersion: "2" },
  );
  const id = data?.createRecurringDonation?.id;
  if (id == null) {
    throw new ErrorException(
      "Giveth didn't confirm the recurring donation record",
    );
  }
  return Number(id);
}

/**
 * Update an existing recurring donation's rate, or end it with
 * `status: "ended"`. Falls back to creating the record when Giveth doesn't
 * know the stream (same recovery the Giveth UI performs).
 */
export async function updateRecurringDonation(
  module: Module,
  jwt: string,
  record: RecurringDonationRecord,
  status?: "ended",
): Promise<number> {
  let data: any;
  try {
    data = await postGraphql(
      module,
      UPDATE_RECURRING_DONATION_MUTATION,
      {
        projectId: record.projectId,
        networkId: record.chainId,
        currency: record.currency,
        txHash: record.txHash,
        flowRate: record.flowRate.toString(),
        anonymous: record.anonymous,
        status,
      },
      { Authorization: `Bearer ${jwt}`, authVersion: "2" },
    );
  } catch (err: any) {
    const message = String(err?.message ?? err).toLowerCase();
    if (
      status === undefined &&
      message.includes("recurring donation not found")
    ) {
      return createRecurringDonation(module, jwt, record);
    }
    throw err;
  }
  const id = data?.updateRecurringDonationParams?.id;
  if (id == null) {
    throw new ErrorException(
      "Giveth didn't confirm the recurring donation update",
    );
  }
  return Number(id);
}

/** Mark a recurring donation verified once its transaction has confirmed. */
export async function verifyRecurringDonation(
  module: Module,
  jwt: string,
  donationId: number,
): Promise<void> {
  const data = await postGraphql(
    module,
    UPDATE_RECURRING_DONATION_STATUS_MUTATION,
    { donationId, status: "verified" },
    { Authorization: `Bearer ${jwt}`, authVersion: "2" },
  );
  if (data?.updateRecurringDonationStatus?.id == null) {
    throw new ErrorException(
      "Giveth didn't confirm the recurring donation status update",
    );
  }
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
