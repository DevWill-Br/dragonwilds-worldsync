import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCloud,publicJournal,planAction,safeError} from '../bridge.mjs';
test('UI commands delegate to the existing lifecycle, without a publish while running',()=>{
 assert.deepEqual(planAction('start','idle',false),['assume','start-server']);
 assert.deepEqual(planAction('stop','running',true),['stop-server','publish']);
 assert.deepEqual(planAction('start','prepared',true),['start-server']);
 assert.deepEqual(planAction('publish','stopped',true),['publish']);
 assert.throws(()=>planAction('publish','running',true));
 for(const phase of ['finalizing','stopping','publishing','recovery_required'])for(const action of ['start','stop','publish'])assert.throws(()=>planAction(action,phase,true));
});
test('public snapshots exclude secrets, raw journal, session identity and unknown errors',()=>{
 const secret='NEVER_DISPLAY_THIS_SECRET';
 const c=publicCloud({worldId:'test',currentRevision:2,availability:'free',token:secret,OwnerId:secret,session:{sessionId:secret,AdminPassword:secret},latest:{worldRevision:2,sha256:'a'.repeat(64),bytes:10,committedBy:{sessionId:secret,WorldPassword:secret}}});
 const j=publicJournal({phase:'recovery_required',failure:secret,token:secret,session:{OwnerId:secret}});
 assert.equal(JSON.stringify({c,j}).includes(secret),false);assert.equal(j.phase,'recovery_required');assert.equal(safeError(secret),'OPERATION_FAILED');
});
test('stop completion is awaited and publication is never sent after a failed stop',async()=>{
 const {runPlan}=await import('../bridge.mjs');const sent=[];
 await assert.rejects(()=>runPlan(['stop-server','publish'],async c=>{sent.push(c);throw Error('STOP_FAILED');}));
 assert.deepEqual(sent,['stop-server']);
 const done=[];await runPlan(['stop-server','publish'],async c=>{await new Promise(r=>setTimeout(r,5));done.push(c);});
 assert.deepEqual(done,['stop-server','publish']);
});
