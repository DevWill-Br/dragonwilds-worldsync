import { mkdir, lstat, open, readFile, rename, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './cloud.mjs';
const run = promisify(execFile);
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const fixtureBase = path.join(repoRoot, 'tests', '.scratch', 'lifecycle');

export async function noLinks(target) {
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OUTSIDE_PROJECT');
  let current = repoRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw new Error('REPARSE_POINT_REJECTED');
    if (info?.isFile() && info.nlink !== 1) throw new Error('HARDLINK_REJECTED');
  }
}
export async function atomicJson(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = await open(temp, 'wx');
  try { await fd.writeFile(JSON.stringify(data, null, 2)); await fd.sync(); } finally { await fd.close(); }
  await rename(temp, file);
}
export class FixtureFiles {
  static async create(name) {
    if (!/^[a-z0-9-]{1,60}$/.test(name)) throw new Error('INVALID_FIXTURE_NAME');
    const root = path.join(fixtureBase, name);
    await noLinks(root);
    await mkdir(root, { recursive: true });
    const files = new FixtureFiles(await realpath(root));
    if (files.root.toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error('FIXTURE_ALIAS_REJECTED');
    for (const dir of ['saves', 'staging', 'backups']) { await noLinks(path.join(root, dir)); await mkdir(path.join(root, dir), { recursive: true }); }
    return files;
  }
  constructor(root) { this.root = root; this.save = path.join(root, 'saves', 'synthetic.sav'); this.journal = path.join(root, 'lifecycle.json'); }
  async lock() {
    await noLinks(path.join(this.root, 'supervisor.lock'));
    this.lockFile = await open(path.join(this.root, 'supervisor.lock'), 'wx').catch(() => { throw new Error('SUPERVISOR_LOCKED_RECOVERY_REQUIRED'); });
    await this.lockFile.writeFile(JSON.stringify({ pid: process.pid })); await this.lockFile.sync();
  }
  async unlock() {
    await this.lockFile?.close();
    // Archive instead of deleting, and only when the supervisor has no live child.
    await rename(path.join(this.root, 'supervisor.lock'), path.join(this.root, `supervisor-${randomUUID()}.closed`));
  }
  async record(state) { await noLinks(this.journal); await atomicJson(this.journal, state); }
  async previous() { await noLinks(this.journal); return JSON.parse(await readFile(this.journal, 'utf8').catch(error => { if (error.code === 'ENOENT') return 'null'; throw error; })); }
  async stage(bytes) {
    if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('SAVE_SIZE_REJECTED');
    const file = path.join(this.root, 'staging', `${randomUUID()}.sav`);
    await noLinks(file);
    const fd = await open(file, 'wx');
    try { await fd.writeFile(bytes); await fd.sync(); } finally { await fd.close(); }
    const actual = await readFile(file);
    if (actual.length !== bytes.length || digest(actual) !== digest(bytes)) throw new Error('STAGING_INTEGRITY_FAILED');
    return file;
  }
  async operation(action, stage = '', expected) {
    if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
    for (const p of [this.root, this.save, ...(stage ? [stage] : [])]) await noLinks(p);
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'src/lifecycle/SaveIO.ps1'), '-Root', this.root, '-Action', action, ...(stage ? ['-Stage', stage] : []), ...(expected ? ['-ExpectedSha256', expected.sha256, '-ExpectedBytes', String(expected.bytes)] : [])], { windowsHide: true, timeout: 15000 });
      return JSON.parse(stdout.trim());
    } catch (error) {
      const code = /WS_[A-Z_]+/.exec(error.stderr || '')?.[0];
      throw new Error(code || 'SAVE_IO_FAILED');
    }
  }
  async snapshot() { return this.operation('Snapshot'); }
  async install(stage, expected) { return this.operation('Install', stage, expected); }
  async readStage(stage) { await noLinks(stage); return readFile(stage); }
}
