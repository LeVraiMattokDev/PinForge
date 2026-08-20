/**
 * Bundles the browser runtime once, at build time, so `pinforge export` is a
 * file copy and a string replace rather than a bundler invocation. esbuild is a
 * build dependency of this package and never runs on a user's machine.
 */
import { build } from 'esbuild';

const result = await build({
  entryPoints: [new URL('../runtime/boot.ts', import.meta.url).pathname],
  outfile: new URL('../runtime/pinforge-runtime.js', import.meta.url).pathname,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
process.stdout.write(`pinforge runtime bundled: ${(bytes / 1024).toFixed(1)} kB\n`);
