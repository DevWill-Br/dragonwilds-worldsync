import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCloud,publicJournal,safeError} from '../bridge.mjs';
test('public snapshots exclude secrets, raw journal, session identity and unknown errors',()=>{
 const secret='NEVER_DISPLAY_THIS_SECRET';
 const c=publicCloud({worldId:'test',currentRevision:2,availability:'free',token:secret,OwnerId:secret,session:{sessionId:secret,AdminPassword:secret},latest:{worldRevision:2,sha256:'a'.repeat(64),bytes:10,committedBy:{sessionId:secret,WorldPassword:secret}}});
 const j=publicJournal({phase:'recovery_required',failure:secret,token:secret,session:{OwnerId:secret}});
 assert.equal(JSON.stringify({c,j}).includes(secret),false);assert.equal(j.phase,'recovery_required');assert.equal(safeError(secret),'OPERATION_FAILED');
});
