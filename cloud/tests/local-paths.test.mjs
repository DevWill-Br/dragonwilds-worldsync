import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { localArgs, localStatePath, assertStatePath } from '../scripts/local-paths.mjs';

test('local state is stable, checkout-specific and outside the long checkout', () => {
  const base = path.resolve('short');
  const options = { root: path.resolve('a'.repeat(150)), env: { LOCALAPPDATA: base }, platform: 'win32' };
  // Use a short override in this assertion because the checkout itself can be very deep.
  const short = process.platform === 'win32' ? 'C:\\ws' : '/tmp/ws';
  options.env.LOCALAPPDATA = short;
  const first = localStatePath(options);
  assert.equal(first, localStatePath(options));
  assert.notEqual(first, localStatePath({ ...options, root: path.resolve('another') }));
  assert.ok(first.startsWith(short));
});
test('reject long Windows SQLite paths before starting the runtime', () => {
  assert.throws(() => assertStatePath(path.resolve('x'.repeat(200)), 'win32'), /too long/);
  assert.throws(() => localStatePath({ env: { WORLDSYNC_LOCAL_STATE_DIR: 'relative' } }), /absolute/);
});
test('local arguments force loopback, local bindings and explicit persistence', () => {
  const statePath = process.platform === 'win32' ? 'C:\\ws' : '/tmp/ws';
  const args = localArgs({ statePath });
  assert.ok(args.includes('--local'));
  assert.ok(args.includes('127.0.0.1'));
  assert.equal(args[args.indexOf('--persist-to') + 1], statePath);
  assert.ok(!args.includes('--remote') && !args.includes('--tunnel'));
});
