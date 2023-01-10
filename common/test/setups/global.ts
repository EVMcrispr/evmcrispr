import { closeServer, runServer } from '../src/chain-manager/app';

export async function setup(port: number): Promise<void> {
  await runServer(port);
}

export function teardown(): void {
  closeServer();
}
