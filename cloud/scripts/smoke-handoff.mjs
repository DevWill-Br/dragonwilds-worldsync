import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CloudClient, digest } from '../../src/lifecycle/cloud.mjs';
import { validateProfile } from '../../tools/host/host.mjs';

async function run() {
  const profiles = await Promise.all([process.env.WORLDSYNC_PROFILE_A, process.env.WORLDSYNC_PROFILE_B].map(async file => validateProfile(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')))));
  const [a,b]=profiles;
  assert.notEqual(a.labPath,b.labPath); assert.notEqual(a.machineId,b.machineId);
  assert.equal(a.cloudUrl,b.cloudUrl); assert.ok(a.cloudUrl.startsWith('https://'));
  const worldId=`handoff-${randomUUID()}`;
  const clients=profiles.map(p=>new CloudClient({baseUrl:p.cloudUrl,token:process.env.WORLDSYNC_API_TOKEN,worldId,host:p.host,machineId:p.machineId}));
  const [pcA,pcB]=clients;
  const initial=Buffer.concat([Buffer.from('SYNTHETIC handoff baseline\n'),randomBytes(128)]);
  await pcA.commit(await pcA.acquire(),initial);
  const sessionA=await pcA.acquire();
  const downloadedA=await pcA.download((await pcA.status()).latest);
  assert.deepEqual(downloadedA,initial);
  await assert.rejects(pcB.acquire(),/WORLD_BUSY/);
  await pcA.heartbeat(sessionA.sessionId);
  const revisionA=Buffer.concat([downloadedA,Buffer.from('\nSYNTHETIC change by profile A')]);
  const dirs=profiles.map(p=>path.join(p.labPath,'cloud-handoff',worldId));
  for(const dir of dirs)await mkdir(dir,{recursive:true});
  await writeFile(path.join(dirs[0],'synthetic.sav'),revisionA,{flag:'wx'});
  await pcA.commit(sessionA,revisionA);
  const sessionB=await pcB.acquire();assert.equal(sessionB.baseRevision,2);
  const latest=(await pcB.status()).latest;
  const downloadedB=await pcB.download(latest);
  assert.equal(digest(downloadedB),digest(revisionA));assert.deepEqual(downloadedB,revisionA);
  await writeFile(path.join(dirs[1],'synthetic.sav'),downloadedB,{flag:'wx'});
  await pcB.heartbeat(sessionB.sessionId);
  await pcB.commit(sessionB,downloadedB); // release B without introducing another payload
  const final=await pcB.status();assert.equal(final.availability,'free');assert.equal(final.session,null);
  const result={passed:true,worldId,publishedByA:2,downloadedByB:2,releasedRevision:3,sha256:digest(downloadedB),bytes:downloadedB.length,distinctLabs:true,distinctMachines:true,realServerRepeated:false};
  await writeFile(path.join(dirs[0],'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
run().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'HANDOFF_SMOKE_FAILED');process.exitCode=1;});
