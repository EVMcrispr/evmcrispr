/** DappNode Nexus OAuth session ("Login with Dappnode Nexus"). */
export interface NexusAuth {
  access_token: string;
  refresh_token: string;
  /** Epoch ms after which access_token is expired. */
  expires_at: number;
  /** Id of the auto-provisioned Nexus API key, for deletion on logout. */
  key_id: string;
}

/** Pluggable persistence for the chat agent's Nexus session and API key. */
export interface ChatStorage {
  getApiKey(): string | null;
  saveApiKey(key: string): void;
  clearApiKey(): void;
  getAuth(): NexusAuth | null;
  saveAuth(auth: NexusAuth): void;
  clearAuth(): void;
}

/** Default `localStorage`-backed storage, namespaced so multiple hosts on
 *  the same origin (or one host reusing the terminal's keys) don't collide. */
export function createLocalStorageChatStorage(
  namespace = "evmcrispr",
): ChatStorage {
  const API_KEY = `${namespace}:nexusApiKey`;
  const AUTH_KEY = `${namespace}:nexusAuth`;

  return {
    getApiKey: () => localStorage.getItem(API_KEY),
    saveApiKey: (key) => localStorage.setItem(API_KEY, key),
    clearApiKey: () => localStorage.removeItem(API_KEY),
    getAuth: () => {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? (JSON.parse(raw) as NexusAuth) : null;
    },
    saveAuth: (auth) => localStorage.setItem(AUTH_KEY, JSON.stringify(auth)),
    clearAuth: () => localStorage.removeItem(AUTH_KEY),
  };
}
