import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { CloudClient, digest } from '../../../src/lifecycle/cloud.mjs';
import { FixtureFiles, noLinks, repoRoot } from '../../../src/lifecycle/files.mjs';
import { FixtureServer, detectServer } from '../../../src/lifecycle/process.mjs';
import { Supervisor } from '../../../src/lifecycle/supervisor.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function lifecycleSuite({ base, token }) {
  let checks = 0;
  const canonical = Buffer.from('canonical synthetic revision one');
  const oldLocal = Buffer.from('previous local synthetic world');
  async function fixture(mode = 'normal') {
    const id = `life-${randomUUID()}`;
    const files = await FixtureFiles.create(id);
    await writeFile(files.save, oldLocal);
    const cloud = new CloudClient({ baseUrl: base, token, worldId: id });
    const first = await cloud.acquire(); await cloud.commit(first, canonical);
    const server = new FixtureServer(files, { mode, startupMs: 500, stopMs: 500 });
    const supervisor = await new Supervisor({ files, server, cloud, heartbeatMs: 400 }).open();
    return { files, cloud, server, supervisor };
  }
  async function check(name, action) { await action(); checks++; console.log(`PASS lifecycle: ${name}`); }
  async function using(mode, action) {
    const f = await fixture(mode);
    try { await action(f); }
    finally {
      // Fault fixtures remain isolated. Switch a deliberately uncooperative fixture
      // to EOF solely for teardown, never used by the publication implementation.
      if (f.server.active()) { f.server.child.stdin.end(); await sleep(100); }
      await f.supervisor.close();
    }
  }
  await check('read-only dedicated executable/config detection', async () => {
    const detected = await detectServer();
    assert.ok(Array.isArray(detected.executables)); assert.ok(Array.isArray(detected.configPaths));
    assert.equal(detected.running, false, 'Stop actual Dragonwilds before running synthetic suite.');
  });
  await check('canonical import, backup, start, heartbeat, graceful stop, revision 2 and release', async () => using('normal', async ({ files, cloud, server, supervisor }) => {
    await supervisor.assume();
    assert.deepEqual(await readFile(files.save), canonical);
    const backups = await readdir(path.join(files.root, 'backups'));
    assert.ok(backups.length >= 1);
    assert.deepEqual(await readFile(path.join(files.root, 'backups', backups[0])), oldLocal);
    await supervisor.startServer(); assert.ok(server.active());
    const before = (await cloud.status()).session.lastHeartbeatUtc;
    await sleep(1000);
    assert.ok((await cloud.status()).session.lastHeartbeatUtc > before);
    await assert.rejects(supervisor.publish(), /SERVER_ACTIVE/);
    await assert.rejects(supervisor.assume(), /LOCAL_SESSION_EXISTS/);
    const stage = await files.stage(canonical);
    await assert.rejects(files.install(stage), /WS_SERVER_ACTIVE/);
    await assert.rejects(files.snapshot(), /WS_SERVER_ACTIVE/);
    assert.equal((await cloud.status()).currentRevision, 1);
    await supervisor.stopServer(); assert.equal(server.active(), false);
    const finalSave = await readFile(files.save);
    assert.notDeepEqual(finalSave, canonical);
    const result = await supervisor.publish(); assert.equal(result.revision, 2);
    const status = await cloud.status();
    assert.equal(status.availability, 'free'); assert.equal(status.session, null);
    assert.equal(status.latest.sha256, digest(finalSave));
    assert.deepEqual(await cloud.download(status.latest), finalSave);
  }));
  await check('failed start retains cloud ownership', async () => using('fail-start', async ({ cloud, supervisor }) => {
    await supervisor.assume(); await assert.rejects(supervisor.startServer(), /SERVER_START_FAILED/);
    assert.ok((await cloud.status()).session); assert.equal(supervisor.state.phase, 'recovery_required');
  }));
  await check('refused shutdown cannot publish', async () => using('refuse-stop', async ({ cloud, server, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer();
    await assert.rejects(supervisor.stopServer(), /SERVER_STOP_TIMEOUT/);
    assert.ok(server.active()); await assert.rejects(supervisor.publish(), /SERVER_ACTIVE/);
    assert.equal((await cloud.status()).currentRevision, 1);
  }));
  for (const [mode, error] of [['missing-save', /WS_SAVE_MISSING/], ['empty-save', /WS_EMPTY_SAVE/]]) {
    await check(`${mode} blocks publication`, async () => using(mode, async ({ cloud, supervisor }) => {
      await supervisor.assume(); await supervisor.startServer(); await supervisor.stopServer();
      await assert.rejects(supervisor.publish(), error);
      assert.equal((await cloud.status()).currentRevision, 1); assert.ok((await cloud.status()).session);
    }));
  }
  await check('corrupt download preserves the previous local save', async () => using('normal', async ({ files, cloud, supervisor }) => {
    cloud.download = async () => Buffer.from('corrupt');
    await assert.rejects(supervisor.assume(), /DOWNLOAD_INTEGRITY_FAILED/);
    assert.deepEqual(await readFile(files.save), oldLocal);
  }));
  await check('corrupted staging rejected before replacing local save', async () => using('normal', async ({ files, supervisor }) => {
    const stage = files.stage.bind(files);
    files.stage = async bytes => { const file = await stage(bytes); await writeFile(file, 'corrupted before install'); return file; };
    await assert.rejects(supervisor.assume(), /WS_IMPORT_INTEGRITY_FAILED/);
    assert.deepEqual(await readFile(files.save), oldLocal);
  }));
  await check('modified installed save cannot start a writer', async () => using('normal', async ({ files, server, supervisor }) => {
    await supervisor.assume(); await writeFile(files.save, 'changed locally');
    await assert.rejects(supervisor.startServer(), /PRESTART_HASH_MISMATCH/);
    assert.equal(server.active(), false);
  }));
  await check('post-copy hash mismatch blocks upload', async () => using('normal', async ({ files, cloud, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer(); await supervisor.stopServer();
    files.readStage = async () => Buffer.from('altered staged bytes');
    await assert.rejects(supervisor.publish(), /STAGING_INTEGRITY_FAILED/);
    assert.equal((await cloud.status()).currentRevision, 1);
  }));
  await check('upload failure retains session and verified staging', async () => using('normal', async ({ cloud, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer(); await supervisor.stopServer();
    cloud.commit = async () => { throw new Error('INJECTED_UPLOAD_FAILURE'); };
    await assert.rejects(supervisor.publish(), /COMMIT_UNCONFIRMED/);
    assert.ok(supervisor.state.snapshot); assert.ok((await cloud.status()).session);
  }));
  await check('lost commit response reconciles without uploading twice', async () => using('normal', async ({ cloud, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer(); await supervisor.stopServer();
    const commit = cloud.commit.bind(cloud); let calls = 0;
    cloud.commit = async (...args) => { calls++; await commit(...args); throw new Error('LOST_RESPONSE'); };
    assert.equal((await supervisor.publish()).revision, 2); assert.equal(calls, 1);
  }));
  await check('base revision changed fails before upload', async () => using('normal', async ({ cloud, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer(); await supervisor.stopServer();
    clearInterval(supervisor.timer); await supervisor.tail;
    const status = cloud.status.bind(cloud);
    cloud.status = async () => ({ ...await status(), currentRevision: 42 });
    await assert.rejects(supervisor.publish(), /BASE_REVISION_CHANGED/);
    assert.equal((await status()).currentRevision, 1);
  }));
  await check('lost session stops writer and prevents publication', async () => using('normal', async ({ cloud, server, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer();
    const status = cloud.status.bind(cloud);
    cloud.status = async () => ({ ...await status(), session: null });
    await sleep(1500);
    assert.equal(supervisor.state.phase, 'recovery_required'); assert.equal(server.active(), false);
    await assert.rejects(supervisor.publish(), /CLEAN_STOP_REQUIRED/);
    assert.equal((await status()).currentRevision, 1);
  }));
  await check('heartbeat network failure stops managed writer', async () => using('normal', async ({ cloud, server, supervisor }) => {
    await supervisor.assume(); await supervisor.startServer();
    cloud.heartbeat = async () => { throw new Error('CLOUD_UNAVAILABLE'); };
    await sleep(1500);
    assert.equal(supervisor.state.phase, 'recovery_required'); assert.equal(server.active(), false);
  }));
  await check('second local supervisor cannot operate same fixture', async () => using('normal', async ({ files }) => {
    await assert.rejects(files.lock(), /SUPERVISOR_LOCKED/);
  }));
  await check('OS write handle prevents snapshot', async () => using('normal', async ({ files }) => {
    const locker = spawn('powershell.exe', ['-NoProfile', '-Command', "$f=[IO.File]::Open($env:WS_FIXTURE_SAVE,'Open','Write','ReadWrite'); try { [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null } finally { $f.Dispose() }"], {
      windowsHide: true, env: { ...process.env, WS_FIXTURE_SAVE: files.save }, stdio: ['pipe', 'pipe', 'pipe']
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Lock fixture timeout')), 5000);
        locker.stdout.once('data', () => { clearTimeout(timer); resolve(); });
        locker.once('error', error => { clearTimeout(timer); reject(error); });
      });
      await assert.rejects(files.snapshot(), /SAVE_IO_FAILED/);
    } finally { locker.stdin.end(); await sleep(100); }
  }));
  await check('junction path rejected without reading its target', async () => using('normal', async ({ files }) => {
    const alias = path.join(files.root, 'alias');
    await symlink(files.root, alias, 'junction');
    await assert.rejects(noLinks(path.join(alias, 'saves', 'synthetic.sav')), /REPARSE_POINT_REJECTED/);
  }));
  await check('path traversal and external endpoints rejected', async () => {
    await assert.rejects(FixtureFiles.create('../escape'), /INVALID_FIXTURE_NAME/);
    assert.throws(() => new CloudClient({ baseUrl: 'https://example.com', token, worldId: 'test' }), /LOCALHOST_ONLY/);
  });
  await check('foreground CLI command sequence completes revision 2', async () => {
    const id = `cli-${randomUUID()}`;
    const cloud = new CloudClient({ baseUrl: base, token, worldId: id });
    await cloud.commit(await cloud.acquire(), canonical);
    const child = spawn(process.execPath, [path.join(repoRoot, 'src/lifecycle/cli.mjs'), id, id, base], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WORLDSYNC_API_TOKEN: token, WORLDSYNC_HEARTBEAT_MS: '400' }
    });
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    let pending;
    lines.on('line', line => { if (line.startsWith('{') && pending) { pending(JSON.parse(line)); pending = null; } });
    const send = command => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = null; reject(new Error('CLI_REPLY_TIMEOUT')); }, 10000);
      pending = reply => { clearTimeout(timer); resolve(reply); };
      child.stdin.write(`${command}\n`);
    });
    try {
      assert.equal((await send('status')).phase, 'idle');
      assert.equal((await send('assume')).phase, 'prepared');
      assert.equal((await send('start-server')).phase, 'running');
      assert.equal((await send('publish')).error, 'SERVER_ACTIVE');
      assert.equal((await send('stop-server')).phase, 'stopped');
      assert.equal((await send('publish')).revision, 2);
      assert.equal((await cloud.status()).availability, 'free');
    } finally {
      child.stdin.end();
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
      lines.close();
    }
    assert.equal(child.exitCode, 0);
  });
  console.log(`PASS lifecycle suite: ${checks} scenarios; synthetic fixtures retained under tests/.scratch/lifecycle`);
}
