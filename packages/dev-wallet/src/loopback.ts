const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether an RPC URL is on this machine: the test wallet's keys are
 *  public, so it serves no chain reached elsewhere. Chain ids cannot decide
 *  it (1337 is both a local node's and a public devnet's). */
export function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
