import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/verify.ts'],
  format: ['esm'],
  platform: 'node',
  dts: true,
  clean: true,
});
