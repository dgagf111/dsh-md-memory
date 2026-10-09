import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
await build({ entryPoints: ['src/index.ts', 'src/core.ts'], bundle: true, format: 'esm', platform: 'node', target: 'node22',
  outdir: 'lib', sourcemap: true, external: ['@deepseek-ai/*', 'yaml'] });
const client = await build({ entryPoints: ['src/client/index.tsx'], bundle: true, format: 'cjs', platform: 'browser', target: 'es2022',
  write: false, external: ['react', 'react/jsx-runtime'], loader: { '.css': 'text' } });
await writeFile('lib/client.js', `window.__ModuleLoader__.load({id:"dsh-md-memory",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`);
