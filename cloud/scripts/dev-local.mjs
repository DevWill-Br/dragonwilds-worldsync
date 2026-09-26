import { spawn } from 'node:child_process';
import { localArgs, localStatePath, wranglerBin } from './local-paths.mjs';

const options = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const [flag, value] = argv.slice(i, i + 2);
  if (flag === '--port' && /^\d+$/.test(value) && Number(value) > 0 && Number(value) < 65536) options.port = Number(value);
  else if (flag === '--log-level' && ['info', 'log', 'warn', 'error', 'none'].includes(value)) options.logLevel = value;
  else throw new Error('Supported local options: --port <1-65535>, --log-level <info|log|warn|error|none>.');
}
const statePath = localStatePath();
console.log(`Local-only persistence: ${statePath}`);
console.log('Existing .wrangler state is preserved; no automatic migration.');
const child = spawn(process.execPath, [wranglerBin, ...localArgs({ ...options, statePath })], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
