import type { Options } from 'tsup';

type GetConfig = Omit<
  Options,
  'bundle' | 'clean' | 'dts' | 'entry' | 'format'
> & {
  entry?: string[];
};

export function getConfig(options: GetConfig = {}): Options {
  return {
    bundle: true,
    clean: true,
    dts: true,
    sourcemap: true,
    format: ['esm', 'cjs'],
    silent: true,
    splitting: true,
    target: 'es2021',
    ...options,
  };
}
