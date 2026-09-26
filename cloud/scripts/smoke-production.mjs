// Synthetic bytes only. Never accepts a save path or reads local world files.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { CloudClient, cloudOrigin, digest } from '../../src/lifecycle/cloud.mjs';

async function smoke() {
  const origin = cloudOrigin(process.env.WORLDSYNC_CLOUD_URL);
  if (!origin.startsWith('https://')) throw new Error('PRODUCTION_HTTPS_REQUIRED');
  const worldId = `smoke-${randomUUID()}`;
  const client = new CloudClient({ baseUrl: origin, token: process.env.WORLDSYNC_API_TOKEN, worldId });
  const health = await fetch(`${origin}/health`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const fresh = await client.status();
  assert.equal(fresh.currentRevision, 0); assert.equal(fresh.availability, 'free');
  const session = await client.acquire();
  assert.equal((await client.heartbeat(session.sessionId)).heartbeat, true);
  const synthetic = Buffer.concat([Buffer.from('WorldSync production smoke: synthetic bytes only\n'), randomBytes(128)]);
  await client.commit(session, synthetic);
  const committed = await client.status();
  assert.equal(committed.currentRevision, 1);
  assert.equal(committed.session, null); assert.equal(committed.availability, 'free');
  assert.equal(committed.latest.sha256, digest(synthetic));
  assert.deepEqual(await client.download(committed.latest), synthetic);
  console.log(JSON.stringify({ passed: true, worldId, revision: 1, bytes: synthetic.length, sha256: digest(synthetic), released: true }));
}
try { await smoke(); }
catch (error) {
  // No raw fetch error, request options, assertion objects or environment output.
  console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'PRODUCTION_SMOKE_FAILED');
  process.exitCode = 1;
}
