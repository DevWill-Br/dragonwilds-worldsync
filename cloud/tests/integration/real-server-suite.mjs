import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { FixtureFiles } from '../../../src/lifecycle/files.mjs';
import { CloudClient, digest } from '../../../src/lifecycle/cloud.mjs';
import { Supervisor } from '../../../src/lifecycle/supervisor.mjs';
import { SandboxServer, labRoot } from '../../../src/lifecycle/sandbox-server.mjs';

export async function realServerSuite({ base, token }) {
  const canonical = await readFile(path.join(labRoot, 'source/WorldSyncTest.sav'));
  assert.equal(digest(canonical), '369f0414f45506eba6d4908361f07c9ecd6c0778888ac167846ca9207f89c0f6');
  const files = await FixtureFiles.create(`real-${randomUUID()}`);
  await writeFile(files.save, canonical);
  const cloud = new CloudClient({ baseUrl: base, token, worldId: `real-${randomUUID()}` });
  const seed = await cloud.acquire(); await cloud.commit(seed, canonical);
  const server = await new SandboxServer(files, { sandboxId: process.env.WORLDSYNC_SANDBOX_ID, wsbPath: process.env.WORLDSYNC_WSB_PATH }).prepare();
  const supervisor = await new Supervisor({ files, server, cloud, heartbeatMs: 10_000 }).open();
  try {
    await supervisor.assume();
    console.log('PASS real: acquire, canonical download/hash, backup and import');
    await supervisor.startServer();
    console.log('PASS real: copied world loaded, game session ready, UDP 7777/8888');
    await assert.rejects(supervisor.publish(), /SERVER_ACTIVE/);
    const initialSave = await server.waitForSave(-1);
    assert.ok(initialSave.success && initialSave.exclusive);
    console.log('PASS real: autosave SUCCESS and exclusive file verification');
    const heartbeatBefore = (await cloud.status()).session.lastHeartbeatUtc;
    await supervisor.stopServer();
    assert.equal(supervisor.state.phase, 'stopped');
    assert.ok(supervisor.state.lastConfirmedSave.eventOffset > initialSave.eventOffset);
    assert.ok((await cloud.status()).session.lastHeartbeatUtc > heartbeatBefore);
    assert.equal(server.active(), false);
    assert.equal(digest(await readFile(files.save)), supervisor.state.lastConfirmedSave.sha256);
    console.log('PASS real: FINALIZING, heartbeat, next confirmed save, Ctrl+C, process exit, verified export');
    const published = await supervisor.publish();
    assert.equal(published.revision, 2);
    const status = await cloud.status();
    assert.equal(status.availability, 'free'); assert.equal(status.session, null);
    assert.equal(status.latest.sha256, supervisor.state.lastConfirmedSave.sha256);
    assert.ok((await readdir(path.join(files.root, 'backups'))).length > 0);
    await writeFile(path.join(labRoot, 'real-e2e-result.json'), JSON.stringify({
      passed: true, revision: 2, released: true, final: supervisor.state.lastConfirmedSave,
      heartbeatDuringFinalizing: true, publishWhileActiveRejected: true, journal: files.journal,
      worldId: status.worldId, base, playerCountQualified: false
    }, null, 2));
    console.log('PASS real E2E: snapshot, cloud commit revision 2, confirmation and session release');
  } finally {
    await supervisor.close();
    if (supervisor.state.phase === 'completed') await server.dispose();
  }
}
