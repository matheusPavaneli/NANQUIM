import { defineConfig } from 'tsdown';

const squash = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

const minifyStyles = {
  name: 'nanquim:minify-styles',
  transform(code: string, id: string): { code: string } | null {
    if (!id.replaceAll('\\', '/').endsWith('src/styles.ts')) return null;
    const declared = code.indexOf('export const styles');
    if (declared === -1) throw new Error('styles.ts no longer declares `styles`');
    const from = code.indexOf('`', declared) + 1;
    const to = code.indexOf('`;', from);
    if (from === 0 || to === -1) throw new Error('styles.ts is no longer one template literal');
    return { code: code.slice(0, from) + squash(code.slice(from, to)) + code.slice(to) };
  },
};

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/styles.ts', 'src/locales/en.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    treeshake: true,
    plugins: [minifyStyles],
  },
  {
    entry: { nanquim: 'src/global.ts' },
    format: ['iife'],
    globalName: 'Nanquim',
    outputOptions: { entryFileNames: '[name].global.js' },
    dts: false,
    clean: false,
    minify: true,
    plugins: [minifyStyles],
  },
]);
