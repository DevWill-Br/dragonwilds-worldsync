import {userDataPaths} from '../user-data/paths.mjs';
import path from 'node:path';
import {mkdir,open,rename,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {FixtureFiles,repoRoot,noLinks} from '../lifecycle/files.mjs';
const exec=promisify(execFile);
export class GameIO {
 constructor(profile={}, {fixtureRoot,processNames=[]}={}){this.profile=profile;this.fixtureRoot=fixtureRoot;this.processNames=processNames;}
 async call(action,extra={}){
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'src/local-game/GameIO.ps1'),'-Action',action];
  const values={SaveRoot:this.profile.saveRoot,FileName:this.profile.fileName,...extra,...(this.fixtureRoot?{FixtureRoot:this.fixtureRoot,FixtureProcesses:JSON.stringify(this.processNames)}:{})};
  for(const [k,v] of Object.entries(values))if(v!==undefined&&v!==null)args.push('-'+k,String(v));
  try{const {stdout}=await exec('powershell.exe',args,{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});return JSON.parse(stdout.replace(/^\uFEFF/,'').trim());}
  catch(e){throw new Error(/WS_[A-Z_]+/.exec(e.stderr||'')?.[0]||'GAME_IO_FAILED');}
 }
 async assertStopped(){if((await this.call('Inspect')).active)throw new Error('WS_GAME_ACTIVE');}
}
export class LocalGameFiles extends FixtureFiles {
 static async create(profile,io){
  const paths=userDataPaths();const root=path.join(paths.state,profile.profile);
  await noLinks(root);for(const dir of ['staging','backups'])await mkdir(path.join(root,dir),{recursive:true});
  const files=new LocalGameFiles(root,profile,io);files.backups=path.join(paths.backups,profile.profile);await noLinks(files.backups);await mkdir(files.backups,{recursive:true});return files;
 }
 constructor(root,profile,io){super(root);this.profile=profile;this.io=io;this.save=path.join(profile.saveRoot,profile.fileName);}
 async lock(){
  const directory=this.io.fixtureRoot?path.join(path.dirname(this.root),'target-locks'):path.join(userDataPaths().state,'target-locks');await noLinks(directory);await mkdir(directory,{recursive:true});
  this.targetLock=path.join(directory,createHash('sha256').update(path.resolve(this.save).toLowerCase()).digest('hex')+'.lock');
  await noLinks(this.targetLock);this.targetHandle=await open(this.targetLock,'wx').catch(()=>{throw new Error('LOCAL_RECOVERY_REQUIRED');});
  await this.targetHandle.writeFile(JSON.stringify({profile:this.profile.profile,pid:process.pid}));await this.targetHandle.sync();
  try{await super.lock();}catch(e){await this.targetHandle.close();await rename(this.targetLock,this.targetLock+'.'+randomUUID()+'.closed');throw e;}
 }
 targetLockPath(){
  const directory=this.io.fixtureRoot?path.join(path.dirname(this.root),'target-locks'):path.join(userDataPaths().state,'target-locks');
  return path.join(directory,createHash('sha256').update(path.resolve(this.save).toLowerCase()).digest('hex')+'.lock');
 }
 async resumeGuards(){
  if(this.lockFile&&this.targetHandle)return [];
  const result=[];
  for(const file of [this.targetLockPath(),path.join(this.root,'supervisor.lock')]){
   await noLinks(file);
   const bytes=await readFile(file);let value;try{value=JSON.parse(bytes);}catch{throw Error('LOCAL_RECOVERY_REQUIRED');}
   if(!Number.isSafeInteger(value.pid)||value.pid<=0)throw Error('LOCAL_RECOVERY_REQUIRED');
   if(file===this.targetLockPath()&&value.profile!==this.profile.profile)throw Error('SESSION_LOST');
   try{process.kill(value.pid,0);throw Error('SUPERVISOR_STILL_ACTIVE');}catch(e){if(e.code!=='ESRCH')throw Error('SUPERVISOR_STILL_ACTIVE');}
   result.push({file,bytes});
  }
  return result;
 }
 async resumeLock(){
  if(this.lockFile&&this.targetHandle)return;
  const gate=this.targetLockPath()+'.resume';await noLinks(gate);
  const handle=await open(gate,'wx').catch(()=>{throw Error('LOCAL_RECOVERY_REQUIRED');});
  try{
   const guards=await this.resumeGuards();
   for(const {file,bytes}of guards){if(!(await readFile(file)).equals(bytes))throw Error('LOCAL_RECOVERY_REQUIRED');}
   for(const {file}of guards)await rename(file,file+'.'+randomUUID()+'.closed');
   await this.lock();
  }finally{await handle.close();await rename(gate,gate+'.'+randomUUID()+'.closed');}
 }
 async unlock(){await super.unlock();await this.targetHandle?.close();await rename(this.targetLock,this.targetLock+'.'+randomUUID()+'.closed');}
 async operation(action,stage='',expected){return this.io.call(action,{StateRoot:this.root,BackupRoot:this.backups,...(stage?{Stage:stage,ExpectedSha256:expected.sha256,ExpectedBytes:expected.bytes}:{})});}
 async snapshot(){const s=await this.operation('Snapshot');if(this.requiredFinal&&(s.sha256!==this.requiredFinal.sha256||s.bytes!==this.requiredFinal.bytes))throw new Error('UNCONFIRMED_SAVE_CHANGE');return s;}
 async stable(pulse=async()=>{}, {quietMs=3000,intervalMs=500,timeoutMs=30000}={}){
  let last=null,since=0;const end=Date.now()+timeoutMs;
  while(Date.now()<end){await pulse();const m=await this.io.call('Metadata');const key=[m.sha256,m.bytes,m.mtimeUtc].join('|');if(key!==last){last=key;since=Date.now();}else if(Date.now()-since>=quietMs){await this.io.assertStopped();return m;}await new Promise(r=>setTimeout(r,intervalMs));}
  throw new Error('SAVE_NOT_STABLE');
 }
}
export class LocalGameHost {
 constructor(io,{autoLaunch=true}={}){this.io=io;this.autoLaunch=autoLaunch;this.running=false;}
 async inspect(){const s=await this.io.call('Inspect');this.running=s.active;return s;}
 active(){return this.running;}
 async assertStopped(){await this.io.assertStopped();this.running=false;}
 async start(){await this.assertStopped();if(this.autoLaunch)await this.io.call('Launch');}
 // Never terminate the user's game, including on loss of cloud ownership.
 async stop(){throw new Error('CLOSE_GAME_MANUALLY');}
}
