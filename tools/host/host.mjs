import { readFile, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudClient, cloudOrigin, digest } from '../../src/lifecycle/cloud.mjs';
import { repoRoot } from '../../src/lifecycle/files.mjs';

export function validateProfile(p) {
  if (!p || !/^[a-z0-9-]{1,40}$/.test(p.profile) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.worldId)) throw new Error('INVALID_PROFILE');
  if (Object.keys(p).some(k => /token|password|secret/i.test(k))) throw new Error('SECRET_IN_PROFILE_REJECTED');
  cloudOrigin(p.cloudUrl);
  for(const key of ['labPath','installPath','wsbPath','wsbFile']) if(!path.isAbsolute(p[key] ?? '')) throw new Error('INVALID_PROFILE_PATH');
  if(!/^[a-f0-9-]{36}$/.test(p.machineId ?? '')) throw new Error('INVALID_MACHINE_ID');
  return p;
}
async function main() {
  const [action, file] = process.argv.slice(2);
  const p = validateProfile(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));
  const client = new CloudClient({ baseUrl:p.cloudUrl, worldId:p.worldId, token:process.env.WORLDSYNC_API_TOKEN, host:p.host, machineId:p.machineId, saveFileName:'WorldSyncTest.sav' });
  if(action === 'status') {console.log(JSON.stringify(await client.status(),null,2));return;}
  if(action === 'preflight') {
    const state=await client.status();
    if(state.currentRevision < 1) throw new Error('CANONICAL_COPY_REQUIRED_RUN_SEED_WORLD');
    if(state.availability !== 'free') throw new Error('WORLD_BUSY_OR_RECOVERY_REQUIRED');
    return;
  }
  if(action === 'seed-world') {
    if(process.env.WORLDSYNC_CONFIRM_SEED !== 'yes') throw new Error('EXPLICIT_SEED_AUTHORIZATION_REQUIRED');
    const source=path.join(p.labPath,'source','WorldSyncTest.sav');
    for(let cursor=source;cursor;cursor=path.dirname(cursor)) {
      const stat=await lstat(cursor);
      if(stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error('LINK_REJECTED');
      if(path.dirname(cursor)===cursor) break;
    }
    if(!(await lstat(path.join(p.labPath,'.worldsync-lab.json'))).isFile()) throw new Error('UNREGISTERED_LAB');
    const bytes=await readFile(source);
    if(!bytes.length || bytes.length > 32*1024*1024) throw new Error('INVALID_SAVE_SIZE');
    const status=await client.status();
    if(status.currentRevision !== 0 || status.availability !== 'free') throw new Error('WORLD_ALREADY_INITIALIZED_OR_BUSY');
    const session=await client.acquire();
    if(session.baseRevision !== 0) throw new Error('BASE_REVISION_CHANGED');
    await client.commit(session,bytes);
    const after=await client.status();
    if(after.currentRevision!==1 || after.latest.sha256!==digest(bytes) || after.session!==null) throw new Error('COMMIT_UNCONFIRMED');
    console.log(JSON.stringify({seeded:true,worldId:p.worldId,revision:1,sha256:after.latest.sha256}));return;
  }
  if(action !== 'start') throw new Error('UNKNOWN_ACTION');
  const child=spawn(process.execPath,[path.join(repoRoot,'src/lifecycle/cli.mjs'),p.profile,p.worldId,p.cloudUrl],{
    windowsHide:true,stdio:'inherit',env:{...process.env,WORLDSYNC_SERVER_ADAPTER:'sandbox',WORLDSYNC_LAB_PATH:p.labPath,WORLDSYNC_SANDBOX_ID:p.sandboxId,WORLDSYNC_WSB_PATH:p.wsbPath,WORLDSYNC_HOST:p.host,WORLDSYNC_MACHINE_ID:p.machineId}
  });
  const [code]=await once(child,'exit');process.exitCode=code ?? 1;
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'HOST_OPERATION_FAILED');process.exitCode=1;});
}
