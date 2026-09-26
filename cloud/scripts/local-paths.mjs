import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const cloudRoot = fileURLToPath(new URL('../', import.meta.url));
export const wranglerBin = path.resolve(path.dirname(createRequire(import.meta.url).resolve('wrangler')), '../bin/wrangler.js');

export function localStatePath({ root = cloudRoot, env = process.env, platform = process.platform } = {}) {
  const key = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 12);
  const base = platform === 'win32' ? (env.LOCALAPPDATA || os.tmpdir()) : (env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'));
  const selected = env.WORLDSYNC_LOCAL_STATE_DIR || path.join(base, 'WorldSync', key);
  if (!path.isAbsolute(selected)) throw new Error('WORLDSYNC_LOCAL_STATE_DIR must be absolute.');
  assertStatePath(selected, platform);
  return path.resolve(selected);
}

export function assertStatePath(statePath, platform = process.platform) {
  // workerd's Windows SQLite VFS also needs room for the -journal/-wal sidecars.
  const database = path.join(statePath, 'v3', 'do', 'dragonwilds-worldsync-api-WorldCoordinator', `${'f'.repeat(64)}.sqlite-journal`);
  if (platform === 'win32' && database.length > 240) {
    throw new Error(`Local SQLite path would be too long (${database.length} characters). Set WORLDSYNC_LOCAL_STATE_DIR to a shorter absolute directory. Existing state has not been moved or deleted.`);
  }
}

export function localArgs({ configPath = path.join(cloudRoot, 'wrangler.jsonc'), statePath = localStatePath(), port = 8787, logLevel = 'info' } = {}) {
  assertStatePath(statePath);
  return ['dev', '--local', '--ip', '127.0.0.1', '--config', configPath,
    '--persist-to', statePath, '--port', String(port), '--log-level', logLevel,
    '--show-interactive-dev-session=false'];
}
