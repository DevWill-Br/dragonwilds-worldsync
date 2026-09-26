import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, rename, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { repoRoot, noLinks } from './files.mjs';
const run = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function detectServer() {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'src/lifecycle/DetectServer.ps1')], { windowsHide: true, timeout: 10000 });
  return JSON.parse(stdout);
}
export class FixtureServer {
  constructor(files, { mode = 'normal', startupMs = 300, stopMs = 3000 } = {}) {
    this.files = files; this.mode = mode; this.startupMs = startupMs; this.stopMs = stopMs;
    this.marker = path.join(files.root, 'server.running');
  }
  active() { return !!this.child?.pid && this.child.exitCode === null && this.child.signalCode === null; }
  async assertStopped() {
    const marker = await lstat(this.marker).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (this.active() || marker || (await detectServer()).running) throw new Error('SERVER_ACTIVE');
  }
  async start() {
    await this.assertStopped();
    await noLinks(this.marker);
    const marker = await open(this.marker, 'wx');
    try { await marker.writeFile('supervised synthetic writer; do not remove automatically'); await marker.sync(); } finally { await marker.close(); }
    this.ready = false;
    this.child = spawn(process.execPath, [path.join(repoRoot, 'tests/fixtures/dedicated-server.mjs'), this.files.root, this.mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdin.on('error', () => {});
    this.child.stdout.on('data', data => { if (data.toString().includes('READY')) this.ready = true; });
    this.child.stderr.resume();
    let failure;
    this.child.on('error', () => { failure = true; });
    await sleep(this.startupMs);
    if (failure || !this.active() || !this.ready) throw new Error('SERVER_START_FAILED');
    return { pid: this.child.pid };
  }
  async stop() {
    if (!this.active()) { await this.assertStopped(); return; }
    // The fixture implements a graceful save-and-exit protocol. Never force-kill.
    this.child.stdin.write('shutdown\n');
    const until = Date.now() + this.stopMs;
    while (this.active() && Date.now() < until) await sleep(25);
    if (this.active()) throw new Error('SERVER_STOP_TIMEOUT');
    if (this.child.exitCode !== 0) throw new Error('SERVER_ABNORMAL_EXIT');
    await rename(this.marker, path.join(this.files.root, `server-${randomUUID()}.stopped`));
    await this.assertStopped();
  }
}
