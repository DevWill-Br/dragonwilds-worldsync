import path from 'node:path';
import {lstat,readdir,readFile,mkdir,copyFile,open,rename,unlink,chmod} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {userDataPaths} from './paths.mjs';
import {validateProfile} from '../local-game/profile.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function safe(p){for(let at=path.resolve(p);;at=path.dirname(at)){const i=await lstat(at).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(i&&(i.isSymbolicLink()||(i.isFile()&&i.nlink!==1)))throw Error('MIGRATION_UNSAFE_PATH');if(path.dirname(at)===at)break;}}
function noSecrets(value){if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(/token|password|ownerid|secret/i.test(k))throw Error('MIGRATION_UNSAFE_CONTENT');noSecrets(v);}}
async function inventory(core,{allowIncomplete=false}={}){
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
  if(!allowIncomplete&&entry.isDirectory()&&entry.name!=='target-locks'&&!await exists(path.join(state,entry.name,'lifecycle.json'))&&(await readdir(path.join(state,entry.name))).length)throw Error('MIGRATION_SESSION_PENDING');
 }
 await walk(state,'state');
 const pref=path.join(core,'ui/artifacts/last-profile.txt');
 if(await exists(pref)){await safe(pref);const bytes=await readFile(pref);if(!/^[a-z0-9-]{1,40}$/.test(bytes.toString().trim()))throw Error('MIGRATION_UNSAFE_CONTENT');result.push({file:pref,out:'preferences/last-profile.txt',hash:hash(bytes)});}
 // Internal backup files only; never follow saveRoot or any journal path.
 for(const item of result){const parts=item.out.split(path.sep);if(parts[0]==='state'&&parts[2]==='backups')item.out=path.join('backups',parts[1],...parts.slice(3));}
 return result.sort((a,b)=>a.file.localeCompare(b.file));
}
// Segment boundaries also exclude tests.scratch, test-output and fixture variants.
export function eligibleLegacyPath(candidate){
 return !path.resolve(candidate).split(/[\\/]+/).some(part=>/^(?:tests?|fixtures?|\.scratch)(?:$|[._-])/i.test(part));
}
function checkoutArtifact(candidate){return /[\\/]ui[\\/]artifacts[\\/]/i.test(path.resolve(candidate));}
function scopedCandidates(core,candidates){
 const portable=path.basename(core).toLowerCase()==='core'&&!checkoutArtifact(core);
 return [...new Set(candidates.map(p=>path.resolve(p)))].filter(p=>eligibleLegacyPath(p)&&(!portable||!checkoutArtifact(p)));
}
export async function legacyCandidates(core){
 const candidates=[core];
 const artifacts=path.dirname(path.dirname(core));
 if(path.basename(core).toLowerCase()==='core'&&path.basename(artifacts)==='artifacts'&&path.basename(path.dirname(artifacts))==='ui'){
  const checkout=path.dirname(path.dirname(artifacts));if(await exists(path.join(checkout,'src/local-game/profile.mjs')))candidates.push(checkout);
 }
 // Independent portable installations only discover sibling releases, never the checkout.
 if(path.basename(core).toLowerCase()==='core'){
  const releases=path.dirname(path.dirname(core));
  for(const entry of await readdir(releases,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory())candidates.push(path.join(releases,entry.name,'core'));
 }
 const found=[];
 for(const candidate of scopedCandidates(core,candidates)){
  await safe(candidate);
  const p=path.join(candidate,'config/local-game');const s=path.join(candidate,'state/local-game');
  await safe(p);await safe(s);
  if((await readdir(p).catch(()=>[])).length||(await readdir(s).catch(()=>[])).length)found.push(candidate);
 }
 return found;
}
function sanitized(candidate){
 const home=process.env.USERPROFILE;
 return (home&&candidate.toLowerCase().startsWith(home.toLowerCase()+path.sep)?'%USERPROFILE%'+candidate.slice(home.length):candidate).replace(/[\x00-\x1f\x7f]/g,'').slice(0,500);
}
async function classify(core){
 const records=await inventory(core,{allowIncomplete:true});
 const profiles=[];const lifecycles=[];
 for(const item of records){
  const parts=item.out.split(/[\\/]/);
  if(parts[0]==='profiles'){
   const p=JSON.parse((await readFile(item.file,'utf8')).replace(/^\uFEFF/,''));
   profiles.push({profile:p.profile,worldId:p.worldId,configuredSave:!!p.saveRoot&&!!p.fileName});
  }
  if(parts[0]==='state'&&parts.length===3&&parts[2]==='lifecycle.json'){
   const j=JSON.parse((await readFile(item.file,'utf8')).replace(/^\uFEFF/,''));
   lifecycles.push({profile:parts[1],phase:j.phase,publishedRevision:j.publishedRevision??0});
  }
 }
 return {core,records,profiles,lifecycles,backups:records.filter(r=>r.out.split(path.sep)[0]==='backups').length,lastProfile:records.some(r=>r.out==='preferences/last-profile.txt')};
}
async function selectSource(core,candidates){
 const classified=[];
 for(const candidate of scopedCandidates(core,candidates))classified.push(await classify(candidate));
 if(!classified.length)return {selected:null,classified};
 const identity=c=>JSON.stringify(c.profiles.map(p=>[p.profile,p.worldId]).sort());
 const contains=(a,b)=>identity(a)===identity(b)&&b.records.every(r=>a.records.some(x=>x.out===r.out&&x.hash===r.hash));
 // Select an actual superset, never merge files or resolve conflicts using timestamps.
 const supersets=classified.filter(a=>classified.every(b=>contains(a,b)));
 if(!supersets.length){const error=Error('MIGRATION_MULTIPLE_SOURCES');error.sources=classified.map(c=>sanitized(c.core));throw error;}
 const selected=supersets.sort((a,b)=>a.core.localeCompare(b.core))[0];
 // An incomplete source is admissible only when a safe, complete superset exists.
 await inventory(selected.core);
 if(!selected.profiles.length)throw Error('MIGRATION_UNSAFE_CONTENT');
 return {selected,classified};
}
export async function initializeUserData({core,paths=userDataPaths(),sources}={}){
 await safe(paths.root);
 if(await exists(paths.root))return {migrated:false,existing:true};
 const {selected,classified}=await selectSource(core,sources??await legacyCandidates(core));
 const records=selected?.records??[];
 await mkdir(path.dirname(paths.root),{recursive:true});
 const lockPath=paths.root+'.migration.lock';let lock;
 try{lock=await open(lockPath,'wx');}catch{throw Error('MIGRATION_SESSION_PENDING');}
 try{
  if(await exists(paths.root))return {migrated:false,existing:true};
  for(const candidate of classified){if(JSON.stringify(await inventory(candidate.core,{allowIncomplete:true}))!==JSON.stringify(candidate.records))throw Error('MIGRATION_SOURCE_CHANGED');}
  const staging=paths.root+'.migration-'+randomUUID();await mkdir(staging);
  for(const folder of ['profiles','state','preferences','backups'])await mkdir(path.join(staging,folder));
  for(const item of records){const target=path.join(staging,item.out);await mkdir(path.dirname(target),{recursive:true});await copyFile(item.file,target);if(hash(await readFile(target))!==item.hash)throw Error('MIGRATION_COPY_FAILED');if(item.mode!==undefined&&(item.mode&0o200)===0)await chmod(target,0o444);}
  for(const candidate of classified){if(JSON.stringify(await inventory(candidate.core,{allowIncomplete:true}))!==JSON.stringify(candidate.records))throw Error('MIGRATION_SOURCE_CHANGED');}
  // Keep source and copied journal bytes unchanged. Completed journal paths are historical evidence.
  const audit={version:1,migrated:records.length>0,files:records.length,utc:new Date().toISOString(),sourcePreserved:true};
  const fd=await open(path.join(staging,'preferences/migration.json'),'wx');try{await fd.writeFile(JSON.stringify(audit));await fd.sync();}finally{await fd.close();}
  await rename(staging,paths.root);return audit;
 }finally{await lock.close();await unlink(lockPath);}
}
