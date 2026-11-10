/** An EIP-1193 error: `code` is what a dapp reads (4001: rejected). */
export class TestWalletError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "TestWalletError";
  }
}
