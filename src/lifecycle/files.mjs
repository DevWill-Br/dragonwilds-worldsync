import {userDataPaths,inside} from '../user-data/paths.mjs';
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
  if (!inside(target,repoRoot) && !inside(target,userDataPaths().root)) throw new Error('OUTSIDE_PROJECT');
  let current = path.parse(path.resolve(target)).root;
  for (const part of path.relative(current,path.resolve(target)).split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw new Error('REPARSE_POINT_REJECTED');
    if (info?.isFile() && info.nlink !== 1) throw new Error('HARDLINK_REJECTED');
  }
}
const journalWrites=new Map();
export async function atomicJson(file, data, {replace=rename,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  // Capture at call time and serialize by destination, including across instances.
  const json=JSON.stringify(data,null,2);
  const key=path.resolve(file).toLowerCase();
  const pending=(journalWrites.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
    const temp = `${file}.${randomUUID()}.tmp`;
    const fd = await open(temp, 'wx');
    try { await fd.writeFile(json); await fd.sync(); } finally { await fd.close(); }
    const delays=[25,50,100,200,400];
    for(let attempt=0;;attempt++){
      try{await replace(temp,file);return;}
      catch(error){
        if(!['EPERM','EBUSY'].includes(error.code))throw error;
        if(attempt===delays.length){
          // Preserve the exclusive temp as evidence; never delete the old journal.
          if(path.basename(file).toLowerCase()==='lifecycle.json'){
            const busy=new Error('JOURNAL_REPLACE_BUSY');busy.code='JOURNAL_REPLACE_BUSY';throw busy;
          }
          throw error;
        }
        await wait(delays[attempt]);
      }
    }
  });
  journalWrites.set(key,pending);
  try{await pending;}finally{if(journalWrites.get(key)===pending)journalWrites.delete(key);}
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
  constructor(root) { this.recordTail=Promise.resolve(); this.root = root; this.save = path.join(root, 'saves', 'synthetic.sav'); this.journal = path.join(root, 'lifecycle.json'); }
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
  record(state) {
    const snapshot=structuredClone(state);
    const write=this.recordTail.catch(()=>{}).then(async()=>{await noLinks(this.journal);await atomicJson(this.journal,snapshot);});
    this.recordTail=write;return write;
  }
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
