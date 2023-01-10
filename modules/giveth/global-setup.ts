import {
  setup as _setup,
  teardown as _teardown,
} from '@1hive/evmcrispr-test-common/setups/global';

export function setup(): Promise<void> {
  return _setup(8002);
}

export function teardown(): void {
  _teardown();
}
