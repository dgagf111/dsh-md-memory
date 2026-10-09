import { mkdir, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const versions = [{ name: 'rc', dsh: '0.2.0-rc.2', cordis: '4.0.4' }, { name: 'alpha', dsh: '0.2.1-alpha.1', cordis: '4.0.5-alpha.1' }];
const packages = ['agent', 'agent-loop', 'llm', 'session', 'session-projection', 'session-query', 'system-prompt', 'tools', 'ptc-runtime',
  'client-connection', 'client-ui-layout', 'client-ui-sidebar', 'client-ui-slots', 'client-ui-renderer', 'client-locale'];
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script with npm run test:compat.');
const archive = process.argv[2] ? resolve(process.argv[2]) : undefined;
async function run(command, args, cwd) {
  await new Promise((resolveDone, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolveDone() : reject(new Error(`${command} exited ${code}`)));
  });
}
for (const version of versions) {
  const directory = resolve('.compat', version.name); await mkdir(directory, { recursive: true });
  const dependencies = { '@deepseek-ai/cordis': version.cordis, '@deepseek-ai/schemastery': '3.18.4', yaml: '^2.8.1' };
  dependencies.react = '19.3.0'; dependencies['@types/react'] = '19.3.0';
  for (const name of packages) dependencies[`@deepseek-ai/dsh-${name}`] = version.dsh;
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: `md-memory-contract-${version.name}`, private: true, type: 'module', dependencies }, null, 2));
  await cp('lib', join(directory, 'plugin', 'lib'), { recursive: true });
  await cp('src', join(directory, 'src'), { recursive: true });
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true,
    noUncheckedIndexedAccess: true, esModuleInterop: true, types: ['node'], noEmit: true, jsx: 'react-jsx', lib: ['ES2023', 'DOM', 'DOM.Iterable'],
  }, include: ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2));
  await writeFile(join(directory, 'plugin', 'package.json'), JSON.stringify({ type: 'module' }));
  await cp('tests/host-harness.mjs', join(directory, 'harness.mjs'));
  console.log(`\nValidating DSH ${version.dsh}, Cordis ${version.cordis}`);
  await run(process.execPath, [npmCli, 'install', '--no-audit', '--no-fund'], directory);
  if (archive) await run(process.execPath, [npmCli, 'install', '--no-save', '--no-audit', '--no-fund', archive], directory);
  await run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', join(directory, 'tsconfig.json')], directory);
  await run(process.execPath, ['harness.mjs', archive ? './node_modules/dsh-md-memory/lib/index.js' : './plugin/lib/index.js'], directory);
}
