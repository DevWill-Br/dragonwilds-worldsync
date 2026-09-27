import path from 'node:path';
import {readFile, readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {CloudClient} from '../src/lifecycle/cloud.mjs';
import {repoRoot} from '../src/lifecycle/files.mjs';
import {validateProfile} from '../tools/host/host.mjs';

export const phases = new Set(['idle','completed','acquiring','acquired','importing','prepared','starting','running','finalizing','stopping','stopped','publishing','recovery_required']);
const knownErrors = new Set(['WS_SERVER_ACTIVE','SERVER_ACTIVE','CLOUD_UNAVAILABLE','UNAUTHORIZED','RECOVERY_REQUIRED','LOCAL_RECOVERY_REQUIRED','SESSION_LOST','COMMIT_UNCONFIRMED','HEARTBEAT_INVALID','DOWNLOAD_INTEGRITY_FAILED','STAGING_INTEGRITY_FAILED','UNCONFIRMED_SAVE_CHANGE','SANDBOX_ISOLATION_START_TIMEOUT','LAB_LOCKED_RECOVERY_REQUIRED','WORLD_BUSY_OR_RECOVERY_REQUIRED','CANONICAL_COPY_REQUIRED_RUN_SEED_WORLD','INVALID_CLOUD_CONFIG','PROFILE_EXISTS_USE_EXISTING_PROFILE_OR_NEW_NAME','SERVER_START_FAILED','SERVER_STOP_TIMEOUT','AUTOSAVE_TIMEOUT']);
export const safeError = value => knownErrors.has(value) ? value : 'OPERATION_FAILED';
const label = value => typeof value === 'string' ? value.replace(/[^\p{L}\p{N}_. -]/gu,'').slice(0,80) : '';
const hash = value => /^[a-f0-9]{64}$/i.test(value ?? '') ? value.toLowerCase() : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
export function publicCloud(s) {
  const l=s?.latest;
  return {worldId:label(s?.worldId), revision:Number.isSafeInteger(s?.currentRevision)?s.currentRevision:0,
    availability:['free','busy','committing','recovery_required'].includes(s?.availability)?s.availability:'unknown',
    host:label(s?.session?.host), sessionStatus:label(s?.session?.status),
    latest:l?{revision:l.worldRevision,hash:hash(l.sha256),bytes:l.bytes,host:label(l.committedBy?.host),time:date(l.committedAtUtc)}:null};
}
export function publicJournal(j) {
  return {phase:phases.has(j?.phase)?j.phase:'idle', confirmed:!!j?.lastConfirmedSave?.success,
    failure:j?.failure?safeError(j.failure):'', revision:j?.publishedRevision??0};
}
export function planAction(action, phase, owned) {
  if(action==='start' && ['idle','completed'].includes(phase) && !owned) return ['assume','start-server'];
  if(action==='start' && phase==='prepared' && owned) return ['start-server'];
  if(action==='stop' && phase==='running' && owned) return ['stop-server','publish'];
  if(action==='publish' && phase==='stopped' && owned) return ['publish'];
  throw new Error('ACTION_NOT_AVAILABLE');
}
export async function runPlan(commands, send, observe=async()=>{}) {
  for(const command of commands){await send(command);await observe();}
}
const parse = text => JSON.parse(text.replace(/^\uFEFF/,''));
export async function main() {
  let child=null, reply=null, banner=null, busy=false, lastCloud=null, phase='idle', selected='', lastFailure='', refreshing=false;
  let profile=null, client=null, owned=false;
  let outputOpen=true;
  process.stdout.on('error',()=>{outputOpen=false;});
  const emit = data => {
    if(!outputOpen)return;
    let output=JSON.stringify(data);
    const token=process.env.WORLDSYNC_API_TOKEN;
    if(token) output=output.split(token).join('[redacted]');
    process.stdout.write(output+'\n');
  };
  const journalPath = () => path.join(repoRoot,'tests/.scratch/lifecycle',selected,'lifecycle.json');
  async function journal() { return parse(await readFile(journalPath(),'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;})); }
  async function snapshot() {
    if(!profile) return;
    const j=await journal(); const local=publicJournal(j); phase=local.phase;
    emit({type:'state',...local,cloud:lastCloud,owned,busy,error:lastFailure,profile:selected,endpoint:profile.cloudUrl,
      recoveryEligible:!child && j?.phase==='recovery_required' && j.failure==='WS_SERVER_ACTIVE' && selected==='pc-a' && j.session?.sessionId==='9954bb05-647c-44c8-9a33-d8cd7576a4c1' && lastCloud?.revision===1});
  }
  async function refresh() {
    if(!client || refreshing)return;
    refreshing=true;
    const requestedClient=client;
    try {const result=await requestedClient.status();if(requestedClient!==client)return;lastCloud=publicCloud(result);lastFailure='';}
    catch(e){if(requestedClient!==client)return;lastFailure=safeError(e.message);lastCloud=null;}
    finally {refreshing=false;await snapshot();}
  }
  async function list() {
    const names=(await readdir(path.join(repoRoot,'config/hosts')).catch(()=>[])).filter(n=>/^[a-z0-9-]{1,40}\.local\.json$/.test(n)).map(n=>n.replace('.local.json',''));
    emit({type:'profiles',names});
  }
  async function select(name) {
    if(child || busy)throw new Error('ACTION_NOT_AVAILABLE');
    if(!/^[a-z0-9-]{1,40}$/.test(name))throw new Error('INVALID_PROFILE');
    const p=validateProfile(parse(await readFile(path.join(repoRoot,'config/hosts',name+'.local.json'),'utf8')));
    selected=name;profile=p;phase='idle';lastCloud=null;
    emit({type:'profile',profile:name,worldId:p.worldId,labPath:p.labPath,installPath:p.installPath,host:label(p.host),endpoint:p.cloudUrl});
    try{client=new CloudClient({baseUrl:p.cloudUrl,worldId:p.worldId,token:process.env.WORLDSYNC_API_TOKEN,host:p.host,machineId:p.machineId});}
    catch(e){client=null;lastFailure=safeError(e.message);await snapshot();return;}
    await refresh();
  }
  async function launch() {
    let readyResolve, readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    banner=readyResolve;
    child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'tools/host/worldsync.ps1'),'start','-Profile',selected],{cwd:repoRoot,windowsHide:true,stdio:['pipe','pipe','pipe'],env:process.env});
    // Drain untrusted process output without forwarding or retaining raw logs.
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{});
    createInterface({input:child.stdout}).on('line',line=>{
      if(line.includes('supervisor. Commands:')){owned=true;banner?.();banner=null;return;}
      let value;try{value=parse(line);}catch{return;}
      if(reply){const pending=reply;reply=null;value.error?pending.reject(new Error(safeError(value.error))):pending.resolve(value);}
    });
    child.on('error',()=>{child=null;owned=false;readyReject(new Error('SUPERVISOR_FAILED'));});
    child.on('exit',()=>{child=null;owned=false;reply?.reject(new Error('SUPERVISOR_EXITED'));reply=null;readyReject(new Error('SUPERVISOR_EXITED'));void snapshot();});
    // Do not kill on timeout: startup may own a live writer. Keep the UI open.
    const timer=setTimeout(()=>readyReject(new Error('SUPERVISOR_START_TIMEOUT')),180000);
    try{await ready;}finally{clearTimeout(timer);}
  }
  async function command(value) {
    if(!child || reply)throw new Error('SUPERVISOR_UNAVAILABLE');
    return new Promise((resolve,reject)=>{reply={resolve,reject};child.stdin.write(value+'\n');});
  }
  async function act(action) {
    if(busy)throw new Error('ACTION_NOT_AVAILABLE');
    await snapshot();
    const commands=planAction(action,phase,owned);busy=true;await snapshot();
    try {
      if(!child)await launch();
      await runPlan(commands,command,snapshot);
      if(commands.includes('publish')){
        await command('status');
        const exited=new Promise(resolve=>child.once('exit',resolve));
        child.stdin.end('exit\n');await exited;
      }
      await refresh();
    }finally{busy=false;await snapshot();}
  }
  async function runScript(script,args=[],input=null) {
    const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'ui/scripts',script),...args],{cwd:repoRoot,windowsHide:true,stdio:['pipe','pipe','pipe'],env:process.env});
    let result=null;createInterface({input:p.stdout}).on('line',line=>{try{result=parse(line);}catch{}});p.stderr.on('data',()=>{});
    p.stdin.on('error',()=>{});p.stdin.end(input?JSON.stringify(input):'');
    const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',resolve);});
    if(code!==0 || !result?.ok)throw new Error('SETUP_FAILED');return result;
  }
  const input=createInterface({input:process.stdin});
  await list();
  const timer=setInterval(()=>{void snapshot().catch(()=>{});},750);
  const cloudTimer=setInterval(()=>{void refresh().catch(()=>{});},10000);
  // Unexpected UI termination must not close stdin of an active supervisor.
  // Retain bridge + supervisor and heartbeat; reopening shows recovery/ownership.
  input.on('close',()=>{if(!child&&!busy){clearInterval(timer);clearInterval(cloudTimer);process.exit();}});
  input.on('line',line=>{void (async()=>{
    let req;try{req=parse(line);}catch{return;}
    try {
      if(req.action==='select')await select(req.profile);
      else if(req.action==='refresh')await refresh();
      else if(['start','stop','publish'].includes(req.action))await act(req.action);
      else if(req.action==='inspect')emit({type:'checks',...await runScript('Inspect.ps1',profile?['-Profile',selected]:[])});
      else if(req.action==='setup') {
        if(child||busy)throw new Error('ACTION_NOT_AVAILABLE');busy=true;
        try{emit({type:'setup',...await runScript('Setup.ps1',[],req.values)});await list();await selectAfterSetup(req.values.profile);}finally{busy=false;}
      }
      else if(req.action==='credentials') {
        if(child||busy||!profile)throw new Error('ACTION_NOT_AVAILABLE');busy=true;
        try{emit({type:'credentials',...await runScript('Credentials.ps1',['-Profile',selected],req.values)});}finally{busy=false;}
      }
      else if(req.action==='recover') {
        // The only validated recovery is incident-specific and performs its own strict checks.
        const j=await journal();
        if(child||busy||selected!=='pc-a'||j?.phase!=='recovery_required'||j.failure!=='WS_SERVER_ACTIVE'||j.session?.sessionId!=='9954bb05-647c-44c8-9a33-d8cd7576a4c1')throw new Error('RECOVERY_UNSUPPORTED');
        busy=true;
        try {
          const p=spawn(process.execPath,[path.join(repoRoot,'tools/host/recover-confirmed.mjs'),req.backup],{cwd:repoRoot,windowsHide:true,stdio:'ignore',env:process.env});
          const code=await new Promise((resolve,reject)=>{p.on('exit',resolve);p.on('error',reject);});
          if(code!==0)throw new Error('RECOVERY_REQUIRED');await refresh();
        }finally{busy=false;await snapshot();}
      }
      else if(req.action==='quit') {
        if(child||busy){emit({type:'closeBlocked'});return;}
        clearInterval(timer);clearInterval(cloudTimer);emit({type:'closed'});input.close();process.exit();
      }
    }catch(e){emit({type:'error',code:safeError(e.message)});await snapshot().catch(()=>{});}
  })();});
  async function selectAfterSetup(name){busy=false;await select(name);}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('UI_BRIDGE_FAILED');process.exitCode=1;});
