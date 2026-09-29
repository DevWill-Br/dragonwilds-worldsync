import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalGameSession} from '../src/local-game/session.mjs';
import {digest} from '../src/lifecycle/cloud.mjs';
function fixture(){
 let time=Date.now(),journal;const counts={acquire:0,beat:0,snapshot:0,install:0,download:0,commit:0,unlock:0};
 const profile={profile:'synthetic',worldId:'synthetic',host:'fixture-pc',machineId:'fixture-machine'};
 const base=Buffer.from('synthetic canonical'),progress=Buffer.from('synthetic progress');
 const session={sessionId:'synthetic-session',worldId:profile.worldId,host:profile.host,machineId:profile.machineId,baseRevision:4,baseSha256:digest(base),status:'hosting'};
 const cloud={value:{worldId:profile.worldId,currentRevision:4,availability:'busy',session:structuredClone(session),latest:{worldRevision:4,sha256:digest(base),bytes:base.length}},fail:0,
 async status(){if(this.fail-->0)throw Error('CLOUD_UNAVAILABLE');return structuredClone(this.value);},
 async acquire(){counts.acquire++;throw Error('MUST_NOT_ACQUIRE');},async download(){counts.download++;throw Error('MUST_NOT_DOWNLOAD');},
 async heartbeat(id){counts.beat++;assert.equal(id,session.sessionId);this.value.availability='busy';return {heartbeat:true,sessionId:id,lastHeartbeatUtc:new Date(time).toISOString()};},
 async commit(s,b){counts.commit++;assert.equal(s.sessionId,session.sessionId);assert.equal(b.toString(),progress.toString());this.value={...this.value,currentRevision:5,session:null,availability:'free',latest:{worldRevision:5,sha256:digest(b),bytes:b.length,committedBy:{sessionId:s.sessionId}}};}};
 const files={profile,async previous(){return structuredClone(journal);},async record(j){journal=structuredClone(j);},async resumeGuards(){},async resumeLock(){},async unlock(){counts.unlock++;},async install(){counts.install++;throw Error('MUST_NOT_INSTALL');},async stable(){return {sha256:digest(progress),bytes:progress.length};},async snapshot(){counts.snapshot++;return {path:'synthetic',sha256:digest(progress),bytes:progress.length};},async readStage(){return progress;}};
 const server={running:true,async inspect(){return {active:this.running};},async assertStopped(){assert.equal(this.running,false);}};
 const s=new LocalGameSession({files,server,cloud,now:()=>time});s.beginHeartbeats=()=>{s.restarted=true;};
 s.state={phase:'running',session:structuredClone(session),gameSeen:true,startedAtUtc:new Date(time-1000).toISOString(),lastHeartbeatUtc:new Date(time-20000).toISOString()};journal=structuredClone(s.state);
 return {s,cloud,files,server,counts,advance:n=>time+=n,async recovery(){await s.recover(Error('CLOUD_UNAVAILABLE'));},journal:()=>structuredClone(journal)};
}
test('isolated status and heartbeat outages retry without abandoning running session',async()=>{
 for(const where of ['status','heartbeat']){const f=fixture();const original=f.cloud[where].bind(f.cloud);let fail=true;f.cloud[where]=async(...args)=>{if(fail){fail=false;throw Error('CLOUD_UNAVAILABLE');}return original(...args);};await f.s.tick();assert.equal(f.s.state.phase,'running');assert.equal(f.s.state.connectionIssue,'CLOUD_UNAVAILABLE');f.advance(1000);await f.s.tick();assert.equal(f.s.state.phase,'running');assert.equal(f.s.state.connectionIssue,undefined);assert.equal(f.counts.acquire,0);}
});
test('bounded backoff survives multiple failures and expiry preserves session',async()=>{
 const f=fixture();f.cloud.fail=3;for(const n of [0,1000,2000]){f.advance(n);await f.s.tick();assert.equal(f.s.state.phase,'running');}const beats=f.counts.beat;await f.s.tick();assert.equal(f.counts.beat,beats);f.advance(4000);await f.s.tick();assert.equal(f.s.retry,null);
 f.advance(11000);f.cloud.fail=100;await f.s.tick();f.advance(60000);await assert.rejects(f.s.tick(),/CLOUD_UNAVAILABLE/);assert.equal(f.s.state.phase,'recovery_required');assert.equal(f.s.state.connectionIssue,undefined);assert.equal(f.s.state.session.sessionId,'synthetic-session');
});
for(const [name,alter,code]of [
 ['session',c=>c.session.sessionId='other','SESSION_LOST'],['revision',c=>c.currentRevision=5,'BASE_REVISION_CHANGED'],['hash',c=>c.latest.sha256='b'.repeat(64),'BASE_REVISION_CHANGED'],['base hash',c=>c.session.baseSha256='b'.repeat(64),'BASE_REVISION_CHANGED'],['stale',c=>c.availability='recovery_required','RECOVERY_REQUIRED'],['foreign PC',c=>c.session.machineId='other-pc','SESSION_LOST']
])test(name+' mismatch fails closed immediately',async()=>{const f=fixture();alter(f.cloud.value);await assert.rejects(f.s.tick(),new RegExp(code));assert.equal(f.s.state.phase,'recovery_required');assert.equal(f.counts.commit,0);});
test('invalid heartbeat fails closed',async()=>{const f=fixture();f.cloud.heartbeat=async()=>({heartbeat:false});await assert.rejects(f.s.tick(),/HEARTBEAT_INVALID/);assert.equal(f.s.state.phase,'recovery_required');});
test('game exit during outage cannot snapshot or publish',async()=>{const f=fixture();f.server.running=false;f.cloud.fail=2;await f.s.tick();f.advance(1000);await f.s.tick();assert.equal(f.counts.snapshot,0);assert.equal(f.counts.commit,0);assert.equal(f.counts.unlock,0);f.advance(2000);await f.s.tick();assert.equal(f.counts.commit,1);});
test('explicit stale resume uses same session, no save IO, then commits exactly once after game exit',async()=>{
 const f=fixture();await f.recovery();f.cloud.value.availability='recovery_required';await f.s.resumeCandidate();assert.equal(f.counts.beat,0);await f.s.resume();assert.equal(f.s.state.phase,'running');assert.equal(f.s.restarted,true);assert.equal(f.s.state.session.sessionId,'synthetic-session');for(const key of ['acquire','download','install','snapshot','commit','unlock'])assert.equal(f.counts[key],0,key);
 f.server.running=false;await f.s.tick();await f.s.tick();assert.equal(f.counts.commit,1);assert.equal(f.cloud.value.currentRevision,5);assert.equal(f.cloud.value.session,null);assert.equal(f.counts.unlock,1);
});
for(const change of ['machine','profile','session','revision','hash','stopped','failure'])test('resume rejects '+change+' without save IO or heartbeat',async()=>{
 const f=fixture();await f.recovery();if(change==='machine')f.cloud.value.session.machineId='foreign';if(change==='profile')f.files.profile.profile='foreign';if(change==='session')f.cloud.value.session.sessionId='foreign';if(change==='revision')f.cloud.value.currentRevision=5;if(change==='hash')f.cloud.value.latest.sha256='c'.repeat(64);if(change==='stopped')f.server.running=false;if(change==='failure'){f.s.state.failure='SESSION_LOST';await f.s.record();}await assert.rejects(f.s.resume());assert.equal(f.journal().phase,'recovery_required');for(const key of Object.keys(f.counts))assert.equal(f.counts[key],0,key);
});
test('legacy journal and reopened supervisor resume without changing progress',async()=>{
 const f=fixture();await f.recovery();delete f.s.state.identity;delete f.s.state.resumePhase;await f.files.record(f.s.state);
 const reopened=new LocalGameSession({files:f.files,cloud:f.cloud,server:f.server});reopened.beginHeartbeats=()=>{};await reopened.resume();assert.equal(reopened.state.phase,'running');assert.equal(f.counts.install,0);assert.equal(f.counts.acquire,0);
});
test('closing recovery preserves failure and evidence for reopen',async()=>{const f=fixture();await f.recovery();const before=f.journal();await f.s.close();assert.deepEqual(f.journal(),before);});

test('filesystem resume preserves dead-owner locks and rejects live supervisors',async()=>{
 const {mkdir,writeFile,readFile,readdir}=await import('node:fs/promises');const path=await import('node:path');const {randomUUID}=await import('node:crypto');const {execFileSync}=await import('node:child_process');
 const {LocalGameFiles}=await import('../src/local-game/host.mjs');const {repoRoot}=await import('../src/lifecycle/files.mjs');
 const root=path.join(repoRoot,'tests/.scratch/local-game',randomUUID());await mkdir(root,{recursive:true});
 const f=fixture();await f.recovery();f.s.state.failure='SESSION_RETAINED_ON_CLOSE';delete f.s.state.resumePhase;delete f.s.state.identity;
 const profile={...f.files.profile,saveRoot:path.join(root,'DO_NOT_CREATE_SAVES'),fileName:'synthetic.sav'};
 const first=new LocalGameFiles(root,profile,{fixtureRoot:profile.saveRoot});await first.lock();
 const second=new LocalGameFiles(root,profile,{fixtureRoot:profile.saveRoot});await second.record(f.s.state);
 const resumed=new LocalGameSession({files:second,cloud:f.cloud,server:f.server});resumed.beginHeartbeats=()=>{};
 await assert.rejects(resumed.resumeCandidate(),/SUPERVISOR_STILL_ACTIVE/);
 await assert.rejects(second.resumeGuards(),/SUPERVISOR_STILL_ACTIVE/);await assert.rejects(second.resumeLock(),/SUPERVISOR_STILL_ACTIVE/);
 await first.lockFile.close();await first.targetHandle.close();
 const dead=Number(execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{windowsHide:true}));
 const guards=[second.targetLockPath(),path.join(root,'supervisor.lock')];
 for(const file of guards)await writeFile(file,JSON.stringify({profile:profile.profile,pid:dead}));
 assert.equal((await resumed.resumeCandidate()).failure,'SESSION_RETAINED_ON_CLOSE');
 await resumed.resume();assert.equal(resumed.state.phase,'running');assert.equal(resumed.state.session.sessionId,'synthetic-session');
 for(const key of ['acquire','download','install','snapshot','commit','unlock'])assert.equal(f.counts[key],0,key);
 assert.ok(second.lockFile&&second.targetHandle);
 for(const file of guards){const archive=(await readdir(path.dirname(file))).find(n=>n.startsWith(path.basename(file)+'.')&&n.endsWith('.closed'));assert.ok(archive);assert.equal(JSON.parse(await readFile(path.join(path.dirname(file),archive))).pid,dead);}
 await second.unlock();await assert.rejects(readFile(path.join(profile.saveRoot,profile.fileName)));
});

async function retainedFixture(){const f=fixture();await f.recovery();f.s.state.failure='SESSION_RETAINED_ON_CLOSE';delete f.s.state.resumePhase;delete f.s.state.identity;await f.files.record(f.s.state);return f;}
test('legacy retained-on-close rejects missing running evidence and arbitrary failures',async()=>{
 for(const change of [j=>delete j.session,j=>j.gameSeen=false,j=>delete j.gameSeen,j=>delete j.startedAtUtc,j=>j.startedAtUtc='invalid',j=>j.resumePhase='publishing',j=>j.session.baseRevision=0,j=>j.failure='SESSION_LOST',j=>j.failure='ARBITRARY_FAILURE']){
  const f=await retainedFixture();change(f.s.state);await f.files.record(f.s.state);const before=f.journal();await assert.rejects(f.s.resume());assert.deepEqual(f.journal(),before);assert.ok(Object.values(f.counts).every(n=>n===0));
 }
});
test('legacy retained-on-close keeps every cloud, process and live-lock guard',async()=>{
 for(const change of [f=>f.server.running=false,f=>f.cloud.value.session.sessionId='other',f=>f.cloud.value.currentRevision=5,f=>f.cloud.value.latest.sha256='c'.repeat(64),f=>f.cloud.value.session.baseRevision=5,f=>f.cloud.value.session.baseSha256='c'.repeat(64),f=>f.cloud.value.session.host='foreign',f=>f.cloud.value.session.machineId='foreign',f=>f.files.resumeGuards=async()=>{throw Error('SUPERVISOR_STILL_ACTIVE');}]){
  const f=await retainedFixture();change(f);const before=f.journal();await assert.rejects(f.s.resumeCandidate());await assert.rejects(f.s.resume());assert.deepEqual(f.journal(),before);assert.ok(Object.values(f.counts).every(n=>n===0));
 }
});
test('closing new build preserves legacy retained-on-close cause exactly',async()=>{const f=await retainedFixture();const before=f.journal();await f.s.close();assert.deepEqual(f.journal(),before);});
async function journalFailureFixture(structured=false){const f=fixture();await f.recovery();f.files.journal='C:\\Synthetic\\WorldSync\\state\\synthetic\\lifecycle.json';f.s.state.failure=structured?'JOURNAL_REPLACE_BUSY':`EPERM: operation not permitted, rename '${f.files.journal}.12345678-1234-4234-8234-123456789abc.tmp' -> '${f.files.journal}'`;if(structured)f.s.state.failureCode='JOURNAL_REPLACE_BUSY';await f.files.record(f.s.state);return f;}
test('journal replace recovery keeps session and has no save IO until game closes',async()=>{
 for(const structured of [false,true]){const f=await journalFailureFixture(structured);await f.s.resumeCandidate();assert.equal(f.counts.beat,0);await f.s.resume();assert.equal(f.s.state.phase,'running');assert.equal(f.s.state.failureCode,undefined);for(const key of ['acquire','download','install','snapshot','commit'])assert.equal(f.counts[key],0);f.server.running=false;await f.s.tick();await f.s.tick();assert.equal(f.counts.commit,1);assert.equal(f.cloud.value.currentRevision,5);}
});
test('journal recovery rejects arbitrary filesystem errors, invalid evidence and authority',async()=>{
 for(const alter of [
 f=>f.s.state.failure=f.s.state.failure.replace('rename','unlink'),f=>f.s.state.failure=f.s.state.failure.replace('EPERM','EACCES'),f=>f.s.state.failure=f.s.state.failure.replaceAll('lifecycle.json','other.json'),f=>f.s.state.failure=f.s.state.failure.replace('12345678-1234-4234-8234-123456789abc','not-uuid'),f=>f.s.state.failure=f.s.state.failure.replaceAll('synthetic\\','foreign\\'),
 f=>delete f.s.state.gameSeen,f=>delete f.s.state.startedAtUtc,f=>f.s.state.startedAtUtc='invalid',f=>f.server.running=false,f=>f.cloud.value.session.sessionId='other',f=>f.cloud.value.currentRevision=5,f=>f.cloud.value.latest.sha256='a'.repeat(64),f=>f.cloud.value.session.machineId='foreign',f=>f.cloud.value.session.host='foreign',f=>f.files.resumeGuards=async()=>{throw Error('SUPERVISOR_STILL_ACTIVE');}
 ]){const f=await journalFailureFixture();alter(f);await f.files.record(f.s.state);const before=f.journal();await assert.rejects(f.s.resumeCandidate());await assert.rejects(f.s.resume());assert.deepEqual(f.journal(),before);assert.ok(Object.values(f.counts).every(n=>n===0));}
});
test('busy record recovery persists sanitized structured failure',async()=>{const f=fixture();await f.s.recover(Object.assign(Error('raw private path'),{code:'JOURNAL_REPLACE_BUSY'}));assert.equal(f.journal().failureCode,'JOURNAL_REPLACE_BUSY');assert.equal(f.journal().failure,'JOURNAL_REPLACE_BUSY');assert.equal(f.journal().resumePhase,'running');});
