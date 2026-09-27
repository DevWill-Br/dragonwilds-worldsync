import path from 'node:path';
import {lstat,readdir,readFile,mkdir,copyFile,open,rename,unlink,chmod} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {userDataPaths} from './paths.mjs';
import {validateProfile} from '../local-game/profile.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function safe(p){for(let at=path.resolve(p);;at=path.dirname(at)){const i=await lstat(at).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(i&&(i.isSymbolicLink()||(i.isFile()&&i.nlink!==1)))throw Error('MIGRATION_UNSAFE_PATH');if(path.dirname(at)===at)break;}}
function noSecrets(value){if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(/token|password|ownerid|secret/i.test(k))throw Error('MIGRATION_UNSAFE_CONTENT');noSecrets(v);}}
async function inventory(core){
 const result=[];
 async function walk(dir,dest){await safe(dir);if(!await exists(dir))return;for(const e of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);await safe(file);const out=path.join(dest,e.name);
  if(e.isDirectory()){await walk(file,out);continue;}
  if(!e.isFile()||e.name.endsWith('.lock')||e.name.endsWith('.running')||e.name.endsWith('.tmp'))throw Error('MIGRATION_SESSION_PENDING');
  const bytes=await readFile(file);
  if(e.name==='lifecycle.json'){
   let j;try{j=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Error('MIGRATION_SESSION_PENDING');}
   if(!['idle','completed'].includes(j.phase)||j.session||(j.phase==='completed'&&!Number.isSafeInteger(j.publishedRevision)))throw Error('MIGRATION_SESSION_PENDING');noSecrets(j);
  }else if(e.name.endsWith('.json')){let j;try{j=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Error('MIGRATION_UNSAFE_CONTENT');}noSecrets(j);if(dest==='profiles'){validateProfile(j);if(j.profile+'.local.json'!==e.name)throw Error('MIGRATION_UNSAFE_CONTENT');}}
  if(dest==='profiles'&&!/^[a-z0-9-]{1,40}\.local\.json$/.test(e.name))throw Error('MIGRATION_UNSAFE_CONTENT');
  result.push({file,out,hash:hash(bytes),mode:(await lstat(file)).mode});
 }}
 await walk(path.join(core,'config/local-game'),'profiles');
 const state=path.join(core,'state/local-game');await safe(state);
 for(const entry of await readdir(state,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  if(entry.isDirectory()&&entry.name!=='target-locks'&&!await exists(path.join(state,entry.name,'lifecycle.json'))&&(await readdir(path.join(state,entry.name))).length)throw Error('MIGRATION_SESSION_PENDING');
 }
 await walk(state,'state');
 const pref=path.join(core,'ui/artifacts/last-profile.txt');
 if(await exists(pref)){await safe(pref);const bytes=await readFile(pref);if(!/^[a-z0-9-]{1,40}$/.test(bytes.toString().trim()))throw Error('MIGRATION_UNSAFE_CONTENT');result.push({file:pref,out:'preferences/last-profile.txt',hash:hash(bytes)});}
 // Internal backup files only; never follow saveRoot or any journal path.
 for(const item of result){const parts=item.out.split(path.sep);if(parts[0]==='state'&&parts[2]==='backups')item.out=path.join('backups',parts[1],...parts.slice(3));}
 return result.sort((a,b)=>a.file.localeCompare(b.file));
}
export async function legacyCandidates(core){
 const candidates=[core];
 // Only the known checkout/ui/artifacts/release/core layout is considered.
 const artifacts=path.dirname(path.dirname(core));
 if(path.basename(core).toLowerCase()==='core'&&path.basename(artifacts)==='artifacts'&&path.basename(path.dirname(artifacts))==='ui'){
  const checkout=path.dirname(path.dirname(artifacts));if(await exists(path.join(checkout,'src/local-game/profile.mjs')))candidates.push(checkout);
 }
 // Portable releases: version-B/core can locate version-A/core beside it.
 if(path.basename(core).toLowerCase()==='core'){
  const releases=path.dirname(path.dirname(core));
  for(const entry of await readdir(releases,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory())candidates.push(path.join(releases,entry.name,'core'));
 }
 const found=[];
 for(const candidate of new Set(candidates)){const p=path.join(candidate,'config/local-game');const s=path.join(candidate,'state/local-game');if((await readdir(p).catch(()=>[])).length||(await readdir(s).catch(()=>[])).length)found.push(candidate);}
 return found;
}
export async function initializeUserData({core,paths=userDataPaths(),sources}={}){
 await safe(paths.root);
 if(await exists(paths.root))return {migrated:false,existing:true};
 await mkdir(path.dirname(paths.root),{recursive:true});
 const lockPath=paths.root+'.migration.lock';let lock;
 try{lock=await open(lockPath,'wx');}catch{throw Error('MIGRATION_SESSION_PENDING');}
 try{
  if(await exists(paths.root))return {migrated:false,existing:true};
  const candidates=sources??await legacyCandidates(core);
  if(candidates.length>1)throw Error('MIGRATION_MULTIPLE_SOURCES');
  const records=candidates.length?await inventory(candidates[0]):[];
  const staging=paths.root+'.migration-'+randomUUID();await mkdir(staging);
  for(const folder of ['profiles','state','preferences','backups'])await mkdir(path.join(staging,folder));
  for(const item of records){const target=path.join(staging,item.out);await mkdir(path.dirname(target),{recursive:true});await copyFile(item.file,target);if(hash(await readFile(target))!==item.hash)throw Error('MIGRATION_COPY_FAILED');if(item.mode!==undefined&&(item.mode&0o200)===0)await chmod(target,0o444);}
  if(candidates.length){const final=await inventory(candidates[0]);if(JSON.stringify(final)!==JSON.stringify(records))throw Error('MIGRATION_SOURCE_CHANGED');}
  // Keep source and copied journal bytes unchanged. Completed journal paths are historical evidence.
  const audit={version:1,migrated:records.length>0,files:records.length,utc:new Date().toISOString(),sourcePreserved:true};
  const fd=await open(path.join(staging,'preferences/migration.json'),'wx');try{await fd.writeFile(JSON.stringify(audit));await fd.sync();}finally{await fd.close();}
  await rename(staging,paths.root);return audit;
 }finally{await lock.close();await unlink(lockPath);}
}
