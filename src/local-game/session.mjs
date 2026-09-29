import {journalReplaceFailure,JOURNAL_REPLACE_BUSY} from '../lifecycle/journal-errors.mjs';
import {Supervisor} from '../lifecycle/supervisor.mjs';
import {digest} from '../lifecycle/cloud.mjs';
export class LocalGameSession extends Supervisor {
 async open(){
  try{return await super.open();}catch(error){
   // Preserve existing evidence; a failed open must never overwrite its journal.
   this.state={phase:'recovery_required',session:null,failure:error.message};throw error;
  }
 }
 async recover(error){clearInterval(this.timer);delete this.state.connectionIssue;if(this.state.phase!=='recovery_required')this.state.resumePhase=this.state.phase;this.state.phase='recovery_required';this.state.failure=error.code===JOURNAL_REPLACE_BUSY?JOURNAL_REPLACE_BUSY:error.message;delete this.state.failureCode;if(error.code===JOURNAL_REPLACE_BUSY)this.state.failureCode=JOURNAL_REPLACE_BUSY;await this.record();}
 constructor(options){super(options);this.now=options.now??Date.now;this.graceMs=options.graceMs??60000;this.retry=null;}
 async record(){
  const p=this.files.profile;
  if(p?.machineId&&!this.state.identity)this.state.identity={profile:p.profile,worldId:p.worldId,host:p.host,machineId:p.machineId};
  await super.record();
 }
 async owned(){
  const status=await super.owned();
  if(this.files.profile?.machineId)this.validateAuthority(this.state,status);
  return status;
 }
 validateAuthority(j,status,{stale=false}={}){
  const p=this.files.profile,s=j.session,c=status.session;
  if(!p?.machineId||!p.host||!s?.sessionId||s.worldId!==p.worldId||status.worldId!==p.worldId)throw Error('SESSION_LOST');
  if(j.identity&&['profile','worldId','host','machineId'].some(k=>j.identity[k]!==p[k]))throw Error('SESSION_LOST');
  if(c?.sessionId!==s.sessionId||c.host!==p.host||c.machineId!==p.machineId)throw Error('SESSION_LOST');
  if(!Number.isSafeInteger(s.baseRevision)||s.baseRevision<0||(s.baseRevision===0?s.baseSha256!==null:!/^[a-f0-9]{64}$/.test(s.baseSha256??''))||status.currentRevision!==s.baseRevision||c.baseRevision!==s.baseRevision||c.baseSha256!==s.baseSha256||(status.latest?.sha256??null)!==s.baseSha256||(s.baseRevision>0&&status.latest?.worldRevision!==s.baseRevision))throw Error('BASE_REVISION_CHANGED');
  if(c.status!=='hosting'||(!stale&&status.availability!=='busy')||(stale&&!['busy','recovery_required'].includes(status.availability)))throw Error('RECOVERY_REQUIRED');
 }
 async pulse(){
  if(this.retry&&this.now()-this.retry.since>=this.graceMs)throw Error('CLOUD_UNAVAILABLE');
  if(this.retry&&this.now()<this.retry.next)return false;
  try{
   await this.owned();const beat=await this.cloud.heartbeat(this.state.session.sessionId);
   if(!beat.heartbeat||beat.sessionId!==this.state.session.sessionId||!Number.isFinite(Date.parse(beat.lastHeartbeatUtc)))throw Error('HEARTBEAT_INVALID');
   await this.owned();this.state.lastHeartbeatUtc=beat.lastHeartbeatUtc;this.retry=null;delete this.state.connectionIssue;await this.record();return true;
  }catch(e){
   if(e.message!=='CLOUD_UNAVAILABLE'||!['running','waiting_for_game'].includes(this.state.phase))throw e;
   const now=this.now();this.retry??={since:now,attempt:0,next:now};
   if(now-this.retry.since>=this.graceMs)throw e;
   this.retry.next=now+Math.min(1000*2**Math.min(this.retry.attempt++,4),10000);
   this.state.connectionIssue='CLOUD_UNAVAILABLE';await this.record();return false;
  }
 }
 async resumeCandidate(j=undefined){
  j??=await this.files.previous();
  const journalBusy=journalReplaceFailure(j,this.files.journal);
  const retained=j?.failure==='SESSION_RETAINED_ON_CLOSE';
  // Old builds overwrote the original recovery reason on close. Accept only
  // evidence of a running game; all authority/process/lock checks below still apply.
  const running=j?.resumePhase==='running'||(!j?.resumePhase&&j?.gameSeen===true&&j?.startedAtUtc);
  if(j?.phase!=='recovery_required'||(!retained&&!journalBusy&&j.failure!=='CLOUD_UNAVAILABLE')||!j.session||!running)throw Error('RESUME_NOT_ALLOWED');
  if((retained||journalBusy)&&(j.gameSeen!==true||typeof j.startedAtUtc!=='string'||!Number.isFinite(Date.parse(j.startedAtUtc))))throw Error('RESUME_NOT_ALLOWED');
  if(j.session.baseRevision<1)throw Error('RESUME_NOT_ALLOWED');
  this.validateAuthority(j,await this.cloud.status(),{stale:true});
  await this.files.resumeGuards();
  if(!(await this.server.inspect()).active)throw Error('RESUME_GAME_NOT_ACTIVE');
  return j;
 }
 async resume(){return this.exclusive(async()=>{
  const candidate=await this.resumeCandidate();
  await this.files.resumeLock(candidate);
  // Recheck after obtaining the local writer guard; never open/download a save.
  const current=await this.files.previous();
  if(JSON.stringify(current)!==JSON.stringify(candidate))throw Error('RESUME_NOT_ALLOWED');
  this.state=structuredClone(candidate);
  try{
   await this.resumeCandidate(this.state);
   const beat=await this.cloud.heartbeat(this.state.session.sessionId);
   if(!beat.heartbeat||beat.sessionId!==this.state.session.sessionId||!Number.isFinite(Date.parse(beat.lastHeartbeatUtc)))throw Error('HEARTBEAT_INVALID');
   this.validateAuthority(this.state,await this.cloud.status());
   if(!(await this.server.inspect()).active)throw Error('RESUME_GAME_NOT_ACTIVE');
   this.retry=null;this.state.phase='running';this.state.lastHeartbeatUtc=beat.lastHeartbeatUtc;
   delete this.state.failure;delete this.state.failureCode;delete this.state.connectionIssue;await this.record();this.beginHeartbeats();
  }catch(e){await this.recover(e);throw e;}
 });}

 beginHeartbeats(){
  clearInterval(this.timer);this.timer=setInterval(()=>{if(this.polling)return;this.polling=true;void this.tick().catch(()=>{}).finally(()=>{this.polling=false;});},1000);
 }
 async tick(){
  try{
  const publish=await this.exclusive(async()=>{
   if(!this.state.session||this.state.phase==='recovery_required')return false;
   if(this.retry||this.now()-Date.parse(this.state.lastHeartbeatUtc||0)>10000||!this.state.lastHeartbeatUtc){if(!await this.pulse())return false;}
   if(!['waiting_for_game','running'].includes(this.state.phase))return false;
   const current=await this.server.inspect();
   if(this.state.phase==='waiting_for_game'){
    if(current.active){this.state.phase='running';this.state.gameSeen=true;this.state.startedAtUtc=new Date().toISOString();await this.record();}
    else if(this.server.autoLaunch&&Date.now()-this.launchTime>120000)throw new Error('GAME_START_TIMEOUT');
    return false;
   }
   if(current.active)return false;
   if(!await this.pulse())return false;
   this.state.phase='finalizing';await this.record();
   const stable=await this.files.stable(async()=>{if(Date.now()-Date.parse(this.state.lastHeartbeatUtc)>10000)await this.pulse();});
   this.files.requiredFinal=stable;this.state.lastStableSave=stable;
   this.state.phase='stopped';await this.record();return true;
  });
  if(publish){await this.publish();await this.finish();}
  }catch(e){await this.recover(e);throw e;}
 }
 async play(){
  await this.server.assertStopped();
  const status=await this.cloud.status();
  if(status.availability!=='free')throw new Error(status.availability==='recovery_required'?'RECOVERY_REQUIRED':'WORLD_BUSY');
  if(status.currentRevision<1)throw new Error('ADOPTION_REQUIRED');
  await this.open();
  try{await this.assume();await this.exclusive(async()=>{
   await this.owned();await this.server.assertStopped();const s=await this.files.snapshot();if(s.sha256!==this.state.session.baseSha256)throw new Error('DOWNLOAD_INTEGRITY_FAILED');
   this.state.phase='waiting_for_game';this.launchTime=Date.now();await this.record();await this.server.start();
  });}catch(e){await this.recover(e);throw e;}
 }
 async adopt({confirmed=false,expectedHash}={}){
  if(!confirmed||!/^[a-f0-9]{64}$/.test(expectedHash??''))throw new Error('EXPLICIT_ADOPTION_CONFIRMATION_REQUIRED');
  await this.server.assertStopped();const before=await this.cloud.status();
  if(before.currentRevision!==0||before.availability!=='free')throw new Error('WORLD_ALREADY_EXISTS');
  await this.open();
  try{
   const stable=await this.files.stable();if(stable.sha256!==expectedHash)throw new Error('ADOPTION_FILE_CHANGED');
   this.files.requiredFinal=stable;
   const snapshot=await this.files.snapshot();const bytes=await this.files.readStage(snapshot.path);
   if(digest(bytes)!==expectedHash||bytes.length!==stable.bytes)throw new Error('ADOPTION_FILE_CHANGED');
   await this.server.assertStopped();const current=await this.cloud.status();if(current.currentRevision!==0||current.availability!=='free')throw new Error('WORLD_ALREADY_EXISTS');
   this.state.phase='acquiring';await this.record();this.state.session=await this.cloud.acquire();await this.record();
   if(this.state.session.baseRevision!==0||this.state.session.baseSha256!==null)throw new Error('BASE_REVISION_CHANGED');
   await this.pulse();this.state.phase='stopped';this.state.lastStableSave=stable;await this.record();
   await this.publish();await this.finish();
  }catch(e){await this.recover(e);throw e;}
 }
 async finish(){
  clearInterval(this.timer);const final=await this.cloud.status();
  if(final.session!==null||final.availability!=='free'||final.currentRevision!==this.state.publishedRevision)throw new Error('COMMIT_UNCONFIRMED');
  await this.files.unlock();
 }
 async close(){if(!['completed','recovery_required'].includes(this.state.phase)&&this.state.session)await this.recover(new Error('SESSION_RETAINED_ON_CLOSE'));clearInterval(this.timer);}
}
