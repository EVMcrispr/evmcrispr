import type { Action, Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { CORS_PROXY_PREFIX, GIVETH_AUTH_URL } from "../addresses";

const SIWE_STATEMENT = "Login into Giveth services";

/**
 * SIWE-login the connected account against the Giveth auth microservice and
 * return the session JWT. The signature request goes through `actionCallback`,
 * so callers must run inside an execution context with wallet access.
 */
export async function givethLogin(
  module: Module,
  actionCallback: (action: Action) => Promise<unknown>,
): Promise<string> {
  const account = getAddress(await module.getConnectedAccount(true));
  const chainId = await module.getChainId();

  const nonceRes = await fetch(
    `${CORS_PROXY_PREFIX}${GIVETH_AUTH_URL}/nonce`,
  ).then((r) => r.json() as Promise<any>);
  const nonce = nonceRes?.message;
  if (!nonce) {
    throw new ErrorException("couldn't obtain a Giveth login nonce");
  }

  const inBrowser = typeof window !== "undefined";
  const domain = inBrowser ? window.location.hostname : "evmcrispr.com";
  const uri = inBrowser ? window.location.origin : "https://evmcrispr.com";
  // EIP-4361 plain-text message; the auth service parses it with `siwe`, so
  // the exact line layout matters.
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    account,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");

  const signature = (await actionCallback({
    type: "wallet",
    method: "personal_sign",
    params: [message, account],
  })) as string;

  const authRes = await fetch(
    `${CORS_PROXY_PREFIX}${GIVETH_AUTH_URL}/authentication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, message, nonce }),
    },
  ).then((r) => r.json() as Promise<any>);
  if (!authRes?.jwt) {
    throw new ErrorException(
      `Giveth sign-in failed${authRes?.message ? `: ${authRes.message}` : ""}`,
    );
  }
  return authRes.jwt;
}
