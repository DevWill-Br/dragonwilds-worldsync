import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CloudClient} from '../src/lifecycle/cloud.mjs';
import {repoRoot} from '../src/lifecycle/files.mjs';
import {GameIO,LocalGameFiles,LocalGameHost} from '../src/local-game/host.mjs';
import {LocalGameSession} from '../src/local-game/session.mjs';
import {profiles,loadProfile,setupProfile,saveOptions} from '../src/local-game/profile.mjs';
const allowed=new Set(['WS_GAME_ACTIVE','WS_SAVE_DIRECTORY_MISSING','WS_GAME_NOT_INSTALLED','WS_LINK_REJECTED','WS_SAVE_ROOT_REJECTED','WS_SAVE_SIZE_REJECTED','WS_IMPORT_INTEGRITY_FAILED','WS_COPY_CHANGED','GAME_START_TIMEOUT','SAVE_NOT_STABLE','GAME_IO_FAILED','WORLD_BUSY','ADOPTION_REQUIRED','WORLD_ALREADY_EXISTS','ADOPTION_FILE_CHANGED','EXPLICIT_ADOPTION_CONFIRMATION_REQUIRED','CLOUD_UNAVAILABLE','UNAUTHORIZED','INVALID_CLOUD_CONFIG','LOCAL_RECOVERY_REQUIRED','RECOVERY_REQUIRED','SESSION_LOST','COMMIT_UNCONFIRMED','DOWNLOAD_INTEGRITY_FAILED','STAGING_INTEGRITY_FAILED','UNCONFIRMED_SAVE_CHANGE']);
export const safeError=e=>allowed.has(e)?e:'OPERATION_FAILED';
const label=s=>typeof s==='string'?s.replace(/[\x00-\x1f]/g,'').slice(0,120):'';
export function publicCloud(c){const l=c?.latest;return {worldId:label(c?.worldId),revision:c?.currentRevision??0,availability:c?.availability??'unknown',host:label(c?.session?.host),sessionStatus:label(c?.session?.status),latest:l?{revision:l.worldRevision,hash:/^[a-f0-9]{64}$/i.test(l.sha256??'')?l.sha256:'',bytes:l.bytes,host:label(l.committedBy?.host),time:l.committedAtUtc}:null};}
export function publicJournal(j){return {phase:j?.phase??'idle',confirmed:!!j?.lastStableSave,failure:j?.failure?safeError(j.failure):'',revision:j?.publishedRevision??0,heartbeat:j?.lastHeartbeatUtc??'',startedAt:j?.startedAtUtc??'',baseRevision:j?.session?.baseRevision??null};}
export async function main(){
 let profile=null,client=null,engine=null,busy=false,cloud=null,lastError='',selectVersion=0,outputOpen=true,refreshing=false;
 process.stdout.on('error',()=>{outputOpen=false;});
 const emit=data=>{if(!outputOpen)return;let text=JSON.stringify(data);if(process.env.WORLDSYNC_API_TOKEN)text=text.split(process.env.WORLDSYNC_API_TOKEN).join('[redacted]');process.stdout.write(text+'\n');};
 const locked=()=>busy||!!engine&&!['completed','recovery_required'].includes(engine.state.phase);
 async function snapshot(){
  if(!profile)return;
  let j=engine?.state;
  if(!j)try{j=JSON.parse(await readFile(path.join(repoRoot,'state/local-game',profile.profile,'lifecycle.json'),'utf8'));}catch{}
  emit({type:'state',...publicJournal(j),cloud,owned:!!engine&&!['completed','recovery_required'].includes(engine.state.phase),busy,error:lastError,profile:profile.profile,endpoint:profile.cloudUrl,recoveryEligible:false});
 }
 async function refresh(){if(!client||refreshing)return;const current=client;refreshing=true;try{const c=await current.status();if(current===client){cloud=publicCloud(c);lastError='';}}catch(e){if(current===client){cloud=null;lastError=safeError(e.message);}}finally{refreshing=false;await snapshot();}}
 async function select(name){
  if(locked())throw new Error('LOCAL_RECOVERY_REQUIRED');const version=++selectVersion;
  const p=await loadProfile(name);if(version!==selectVersion)return;profile=p;engine=null;cloud=null;client=null;
  emit({type:'profile',profile:p.profile,worldId:p.worldId,displayName:p.displayName,fileName:p.fileName,saveRoot:p.saveRoot,autoLaunch:p.autoLaunch,host:p.host,endpoint:p.cloudUrl});
  try{client=new CloudClient({baseUrl:p.cloudUrl,worldId:p.worldId,token:process.env.WORLDSYNC_API_TOKEN,host:p.host,machineId:p.machineId,saveFileName:p.worldId+'.sav'});await refresh();}catch(e){lastError=safeError(e.message);await snapshot();}
 }
 async function createEngine(){if(!profile||!client)throw new Error('INVALID_CLOUD_CONFIG');const io=new GameIO(profile);const files=await LocalGameFiles.create(profile,io);return new LocalGameSession({files,server:new LocalGameHost(io,{autoLaunch:profile.autoLaunch}),cloud:client});}
 const input=createInterface({input:process.stdin});
 emit({type:'profiles',names:await profiles()});
 const ticker=setInterval(()=>{void snapshot().catch(()=>{});},750);
 const cloudTicker=setInterval(()=>{void refresh().catch(()=>{});},10000);
 input.on('close',()=>{if(!locked()){clearInterval(ticker);clearInterval(cloudTicker);process.exit();}});
 let commands=Promise.resolve();
 input.on('line',line=>{commands=commands.then(async()=>{
  let r;try{r=JSON.parse(line);}catch{return;}
  try{
   if(r.action==='select')await select(r.profile);
   else if(r.action==='refresh')await refresh();
   else if(r.action==='inspect'){const s=await new GameIO().call('Inspect');emit({type:'checks',ok:true,installed:s.installed,gameActive:s.active,token:!!process.env.WORLDSYNC_API_TOKEN});}
   else if(r.action==='discover'){
    if(locked())throw new Error('LOCAL_RECOVERY_REQUIRED');busy=true;
    try{emit({type:'worlds',...await new GameIO().call('Discover')});}finally{busy=false;}
   }
   else if(r.action==='setup'){
    if(locked())throw new Error('LOCAL_RECOVERY_REQUIRED');busy=true;let p;
    try{p=await setupProfile(r.values);emit({type:'setup',ok:true});}finally{busy=false;}
    await select(p.profile);emit({type:'profiles',names:await profiles()});
   }
   else if(r.action==='options'){
    if(locked()||!profile)throw new Error('LOCAL_RECOVERY_REQUIRED');profile=await saveOptions(profile.profile,r.autoLaunch);emit({type:'options',ok:true});
   }
   else if(r.action==='start'||r.action==='adopt'){
    if(locked())throw new Error('LOCAL_RECOVERY_REQUIRED');busy=true;
    try{engine=await createEngine();if(r.action==='adopt')await engine.adopt({confirmed:r.confirmed===true&&r.worldId===profile.worldId,expectedHash:r.expectedHash});else await engine.play();}
    finally{if(engine?.state.phase==='idle'&&!engine.files.targetHandle)engine=null;busy=false;await refresh();}
   }
   else if(r.action==='quit'){
    if(locked()){emit({type:'closeBlocked'});return;}
    await engine?.close();clearInterval(ticker);clearInterval(cloudTicker);emit({type:'closed'});input.close();process.exit();
   }
  }catch(e){lastError=safeError(e.message);emit({type:'error',code:lastError});await snapshot();}
 }).catch(()=>{lastError='OPERATION_FAILED';});});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('UI_BRIDGE_FAILED');process.exitCode=1;});
