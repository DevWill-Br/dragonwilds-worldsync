import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, readFile, writeFile, open, rename, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { repoRoot } from './files.mjs';
import { digest } from './cloud.mjs';
import { validateFinalSave } from './confirmed-save.mjs';
const run = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const labRoot = path.resolve(repoRoot, '../real-server-lab');

// This optional adapter is deliberately restricted to the qualified disposable
// Sandbox and copied world. It does not launch a server on the host.
export class SandboxServer {
  constructor(files, { sandboxId, wsbPath, finalizationMs = 12 * 60_000 } = {}) {
    if (!/^[a-f0-9-]{36}$/.test(sandboxId ?? '') || !path.isAbsolute(wsbPath ?? '')) throw new Error('INVALID_SANDBOX_CONFIG');
    this.files = files; this.sandboxId = sandboxId; this.wsbPath = wsbPath;
    this.finalizationMs = finalizationMs; this.marker = path.join(files.root, 'server.running');
    this.running = false;
  }
  async prepare() {
    for (let p = labRoot; p; p = path.dirname(p)) {
      if ((await lstat(p)).isSymbolicLink()) throw new Error('LAB_REPARSE_POINT');
      if (path.dirname(p) === p) break;
    }
    // Persisted lease is never automatically removed after a crash.
    this.lease = await open(path.join(labRoot, 'adapter.lock'), 'wx');
    await this.lease.writeFile('exclusive WorldSync laboratory supervisor'); await this.lease.sync();
    for (const name of ['SandboxServer.ps1', 'Probe-Isolation.ps1']) {
      const dest = path.join(labRoot, name);
      const info = await lstat(dest).catch(e => { if(e.code !== 'ENOENT') throw e; });
      if (info && (info.isSymbolicLink() || info.nlink !== 1)) throw new Error('LAB_LINK_REJECTED');
      await copyFile(path.join(repoRoot, 'tools/real-server-sandbox', name), dest);
    }
    await this.assertStopped();
    return this;
  }
  async call(action, expectedHash) {
    const id = randomUUID();
    if (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('INVALID_EXPECTED_HASH');
    const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\WorldSyncLab\\SandboxServer.ps1 -Action ${action} -RequestId ${id}${expectedHash ? ` -ExpectedSha256 ${expectedHash}` : ''}`;
    try {
      await run(this.wsbPath, ['exec', '--id', this.sandboxId, '--command', command, '--run-as', 'ExistingLogin', '--raw'], { windowsHide: true, timeout: 45_000 });
      const result = JSON.parse((await readFile(path.join(labRoot, `reply-${id}.json`), 'utf8')).replace(/^\uFEFF/, ''));
      if (result.error) throw new Error(`${result.error}_${action}_${result.line}`);
      return result;
    } catch (error) {
      if (/^SANDBOX_OPERATION_FAILED_/.test(error.message)) throw error;
      throw new Error(`SANDBOX_${action.toUpperCase()}_FAILED`);
    }
  }
  active() { return this.running; }
  async inspect() { const state = await this.call('Inspect'); this.running = state.active; return state; }
  async assertStopped() {
    const state = await this.inspect();
    if (state.active || await lstat(this.marker).catch(e => { if(e.code !== 'ENOENT') throw e; })) throw new Error('SERVER_ACTIVE');
  }
  async start(expected) {
    await this.assertStopped();
    const bytes = await readFile(this.files.save);
    if (digest(bytes) !== expected?.sha256 || bytes.length !== expected?.bytes) throw new Error('PRESTART_HASH_MISMATCH');
    const target = path.join(labRoot, 'adapter-input.sav');
    const info = await lstat(target).catch(e => { if(e.code !== 'ENOENT') throw e; });
    if (info && (info.isSymbolicLink() || info.nlink !== 1)) throw new Error('LAB_LINK_REJECTED');
    await writeFile(target, bytes);
    if (digest(await readFile(target)) !== digest(bytes)) throw new Error('IMPORT_HASH_MISMATCH');
    await writeFile(this.marker, 'sandbox real writer; retain on failure', { flag: 'wx' });
    this.running = true; // fail closed even if the launch response is lost
    const started = await this.call('Start', expected.sha256);
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      const state = await this.inspect();
      if (!state.active) throw new Error('SERVER_START_FAILED');
      if (state.ready) { this.initialSave = state.confirmed; return { pid: started.pid }; }
      await sleep(500);
    }
    throw new Error('READINESS_TIMEOUT');
  }
  async waitForSave(afterOffset, heartbeat = async () => {}) {
    const until = Date.now() + this.finalizationMs;
    while (Date.now() < until) {
      await heartbeat();
      const state = await this.inspect();
      if (!state.active) throw new Error('SERVER_UNEXPECTED_EXIT');
      if (state.confirmed?.eventOffset > afterOffset) return state.confirmed;
      await sleep(500);
    }
    throw new Error('AUTOSAVE_TIMEOUT');
  }
  async finalize(heartbeat) {
    const state = await this.inspect();
    // Require a new success after FINALIZING began, even if the last hash is equal.
    return this.waitForSave(state.confirmed?.eventOffset ?? -1, heartbeat);
  }
  async stop(confirmed) {
    const state = await this.inspect();
    if (state.active) await this.call('Signal');
    const until = Date.now() + 60_000;
    let stopped;
    do { stopped = await this.inspect(); if (!stopped.active) break; await sleep(500); } while(Date.now() < until);
    if (stopped.active) throw new Error('SERVER_STOP_TIMEOUT');
    if (!confirmed) throw new Error('RECOVERY_NO_CONFIRMED_SAVE');
    // This build reports STATUS_CONTROL_C_EXIT after its ConsoleCtrl handler.
    // Accept only after an explicit signal and a matching, completed save.
    if (!state.active || ![0, -1073741510].includes(stopped.exit?.exitCode)) throw new Error('SERVER_ABNORMAL_EXIT');
    const exported = await this.call('Export');
    const accepted = validateFinalSave(confirmed, exported.final, exported.latest);
    if (!/^export-[a-f0-9-]{36}\.sav$/.test(exported.exportName)) throw new Error('EXPORT_PATH_REJECTED');
    const bytes = await readFile(path.join(labRoot, exported.exportName));
    if (digest(bytes) !== accepted.sha256 || bytes.length !== accepted.bytes) throw new Error('EXPORT_HASH_MISMATCH');
    const staged = await this.files.stage(bytes);
    await rename(this.marker, path.join(this.files.root, `server-${randomUUID()}.stopped`));
    await this.files.install(staged, accepted); // existing backup-before-import and atomic replacement
    this.accepted = accepted;
    return accepted;
  }
  async dispose() {
    await this.assertStopped();
    await this.lease?.close();
    await rename(path.join(labRoot, 'adapter.lock'), path.join(labRoot, `adapter-${randomUUID()}.closed`));
  }
}
