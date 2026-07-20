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
  _module: Module,
  slug: string,
): Promise<GivethProject> {
  const res = await fetch(CORS_PROXY_PREFIX + GIVETH_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: PROJECT_QUERY, variables: { slug } }),
  }).then((r) => r.json() as Promise<any>);

  const project = res?.data?.projectBySlug;
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
