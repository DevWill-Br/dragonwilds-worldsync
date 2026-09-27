import {Supervisor} from '../lifecycle/supervisor.mjs';
import {digest} from '../lifecycle/cloud.mjs';
export class LocalGameSession extends Supervisor {
 async open(){
  try{return await super.open();}catch(error){
   // Preserve existing evidence; a failed open must never overwrite its journal.
   this.state={phase:'recovery_required',session:null,failure:error.message};throw error;
  }
 }
 async recover(error){clearInterval(this.timer);this.state.phase='recovery_required';this.state.failure=error.message;await this.record();}
 async pulse(){await this.owned();const beat=await this.cloud.heartbeat(this.state.session.sessionId);if(!beat.heartbeat||beat.sessionId!==this.state.session.sessionId)throw new Error('HEARTBEAT_INVALID');this.state.lastHeartbeatUtc=beat.lastHeartbeatUtc;await this.record();}
 beginHeartbeats(){
  clearInterval(this.timer);this.timer=setInterval(()=>{if(this.polling)return;this.polling=true;void this.tick().catch(e=>this.recover(e)).finally(()=>{this.polling=false;});},1000);
 }
 async tick(){
  const publish=await this.exclusive(async()=>{
   if(!this.state.session||this.state.phase==='recovery_required')return false;
   if(Date.now()-Date.parse(this.state.lastHeartbeatUtc||0)>10000||!this.state.lastHeartbeatUtc)await this.pulse();
   if(!['waiting_for_game','running'].includes(this.state.phase))return false;
   const current=await this.server.inspect();
   if(this.state.phase==='waiting_for_game'){
    if(current.active){this.state.phase='running';this.state.gameSeen=true;this.state.startedAtUtc=new Date().toISOString();await this.record();}
    else if(this.server.autoLaunch&&Date.now()-this.launchTime>120000)throw new Error('GAME_START_TIMEOUT');
    return false;
   }
   if(current.active)return false;
   this.state.phase='finalizing';await this.record();
   const stable=await this.files.stable(async()=>{if(Date.now()-Date.parse(this.state.lastHeartbeatUtc)>10000)await this.pulse();});
   this.files.requiredFinal=stable;this.state.lastStableSave=stable;
   this.state.phase='stopped';await this.record();return true;
  });
  if(publish){await this.publish();await this.finish();}
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
 async close(){if(this.state.phase!=='completed'&&this.state.session)await this.recover(new Error('SESSION_RETAINED_ON_CLOSE'));clearInterval(this.timer);}
}
