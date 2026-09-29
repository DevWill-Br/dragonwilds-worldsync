import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,rename} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';
import {atomicJson,repoRoot} from '../src/lifecycle/files.mjs';
async function fixture(){const root=path.join(repoRoot,'tests/.scratch/journal',randomUUID());await mkdir(root,{recursive:true});const file=path.join(root,'lifecycle.json');await writeFile(file,'{"old":true}');return {root,file};}
for(const code of ['EPERM','EBUSY'])test('atomic replace retries '+code+' preserving original until success',async()=>{
 const {root,file}=await fixture();let calls=0;const delays=[];let source;
 await atomicJson(file,{new:true},{wait:async ms=>delays.push(ms),replace:async(a,b)=>{source??=a;assert.equal(a,source);assert.deepEqual(JSON.parse(await readFile(a)),{new:true});assert.deepEqual(JSON.parse(await readFile(b)),{old:true});if(calls++<2)throw Object.assign(Error('synthetic'),{code});await rename(a,b);}});
 assert.equal(calls,3);assert.deepEqual(delays,[25,50]);assert.deepEqual(JSON.parse(await readFile(file)),{new:true});assert.deepEqual(await readdir(root),['lifecycle.json']);
});
test('permanent errors fail immediately; busy exhaustion is bounded and temp retained',async()=>{
 for(const code of ['EACCES','ENOSPC','ENOENT','EPERM','EBUSY']){const {root,file}=await fixture();let calls=0;const waits=[];await assert.rejects(atomicJson(file,{new:true},{wait:async ms=>waits.push(ms),replace:async()=>{calls++;throw Object.assign(Error('synthetic'),{code});}}),e=>e.code===(['EPERM','EBUSY'].includes(code)?'JOURNAL_REPLACE_BUSY':code));assert.equal(calls,['EPERM','EBUSY'].includes(code)?6:1);assert.deepEqual(waits,calls===6?[25,50,100,200,400]:[]);assert.deepEqual(JSON.parse(await readFile(file)),{old:true});assert.equal((await readdir(root)).filter(n=>n.endsWith('.tmp')).length,1);}
});
test('overlapping writes serialize immutable snapshots even while first replace retries',async()=>{
 const {file}=await fixture();let release,entered;const blocked=new Promise(r=>release=r),seen=new Promise(r=>entered=r);const order=[];let calls=0;
 const one=atomicJson(file,{n:1},{wait:async()=>{entered();await blocked;},replace:async(a,b)=>{if(!calls++)throw Object.assign(Error('busy'),{code:'EBUSY'});order.push(JSON.parse(await readFile(a)).n);await rename(a,b);}});
 await seen;const data={n:2};const two=atomicJson(file,data,{replace:async(a,b)=>{order.push(JSON.parse(await readFile(a)).n);await rename(a,b);}});data.n=99;assert.deepEqual(order,[]);release();await Promise.all([one,two]);assert.deepEqual(order,[1,2]);assert.deepEqual(JSON.parse(await readFile(file)),{n:2});
});
test('record calls preserve invocation order and snapshots per files instance',async()=>{
 const {FixtureFiles}=await import('../src/lifecycle/files.mjs');const {root,file}=await fixture();const files=new FixtureFiles(root);const data={n:1};const one=files.record(data);data.n=2;const two=files.record(data);data.n=99;await Promise.all([one,two]);assert.deepEqual(JSON.parse(await readFile(file)),{n:2});
});
