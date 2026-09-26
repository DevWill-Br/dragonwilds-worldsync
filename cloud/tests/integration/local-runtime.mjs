import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { cloudRoot, localArgs, wranglerBin } from '../../scripts/local-paths.mjs';

const run = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = randomBytes(32).toString('hex');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'ws-'));
const statePath = path.join(scratch, 'state');
const configPath = path.join(scratch, 'wrangler.json');
const config = JSON.parse(await readFile(path.join(cloudRoot, 'wrangler.jsonc'), 'utf8'));
config.main = path.join(cloudRoot, 'src/index.js');
delete config.$schema;
config.vars.SESSION_STALE_SECONDS = '5';
await writeFile(configPath, JSON.stringify(config));
// Only this isolated, generated secret file is loaded. Never read the real .dev.vars.
await writeFile(path.join(scratch, '.dev.vars'), `WORLDSYNC_API_TOKEN=${token}\n`);
const portServer = net.createServer();
portServer.listen(0, '127.0.0.1');
await once(portServer, 'listening');
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child;
let logs = '';
const logsDir = path.join(cloudRoot, '.wrangler', 'local-validation');
await mkdir(logsDir, { recursive: true });

async function start() {
  child = spawn(process.execPath, [wranglerBin, ...localArgs({ configPath, statePath, port })], {
    cwd: scratch, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' }
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs += data.toString().replaceAll(token, '[REDACTED]'); });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  for (let i = 0; i < 120; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Wrangler exited ${child.exitCode}; see sanitized local-validation log.`);
    try { if ((await fetch(`${base}/health`)).status === 200) return; } catch {}
    await sleep(250);
  }
  throw new Error('Wrangler did not become ready within 30 seconds.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') await run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
  else { child.kill('SIGTERM'); await once(child, 'exit'); }
}
async function request(route, body, expected = 200) {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${route}: ${JSON.stringify(value)}`);
  return value;
}

try {
  await start();
  assert.equal((await request('/health')).ok, true);
  assert.equal((await request('/v1/worlds/worldsynctest/debug-ping')).pong, true);
  const fresh = await request('/v1/worlds/worldsynctest/status');
  assert.equal(fresh.worldId, 'worldsynctest');
  assert.equal(fresh.currentRevision, 0);
  assert.equal(fresh.availability, 'free');
  console.log('PASS localhost: health=200, debug-ping=200 pong=true, status=200 revision=0 free');
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(cloudRoot, 'tests/integration/CloudClient.ps1')], {
    windowsHide: true, env: { ...process.env, WORLDSYNC_TEST_URL: base, WORLDSYNC_TEST_TOKEN: token }, timeout: 20000
  });
  const client = JSON.parse(stdout.trim());
  assert.equal(client.secondAcquireRejected, true);
  assert.equal(client.heartbeat, true);
  console.log('PASS PowerShell: CloudAcquire, second acquire WORLD_BUSY, heartbeat timestamp advanced');
  const race = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/v1/worlds/race/acquire`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: 'race-host', machineId: 'race-machine' })
  })));
  assert.equal(race.filter(r => r.status === 201).length, 1);
  assert.equal(race.filter(r => r.status === 409).length, 3);
  await Promise.all(race.map(r => r.arrayBuffer()));
  console.log('PASS concurrent acquire: one owner, three rejections');
  await sleep(5250);
  const stale = await request('/v1/worlds/worldsynctest/status');
  assert.equal(stale.availability, 'recovery_required');
  assert.equal(stale.session.sessionId, client.sessionId);
  assert.equal((await request('/v1/worlds/worldsynctest/acquire', { host: 'other', machineId: 'other' }, 409)).error, 'RECOVERY_REQUIRED');
  assert.equal((await request('/v1/worlds/worldsynctest/heartbeat', { sessionId: 'wrong' }, 403)).error, 'SESSION_MISMATCH');
  console.log('PASS stale: RECOVERY_REQUIRED, no takeover, foreign heartbeat rejected');
  await stop();
  await start();
  const persisted = await request('/v1/worlds/worldsynctest/status');
  assert.equal(persisted.session.sessionId, client.sessionId);
  assert.equal(persisted.availability, 'recovery_required');
  assert.equal((await request('/v1/worlds/worldsynctest/acquire', { host: 'other', machineId: 'other' }, 409)).error, 'RECOVERY_REQUIRED');
  console.log('PASS restart: persisted ownership retained; stale session cannot be stolen');
  console.log(`Validated ${base}; isolated synthetic state retained at ${statePath}`);
} finally {
  await stop();
  await writeFile(path.join(logsDir, 'wrangler.log'), logs);
}
