// Explicit recovery of the known WS_SERVER_ACTIVE incident. No acquire/start/seed.
// The preserved backup is supplied as a path; credentials are environment-only.
import { readFile, open, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FixtureFiles, atomicJson } from '../../src/lifecycle/files.mjs';
import { CloudClient, digest } from '../../src/lifecycle/cloud.mjs';
import { SandboxServer } from '../../src/lifecycle/sandbox-server.mjs';
import { Supervisor } from '../../src/lifecycle/supervisor.mjs';
const expected = {
  sessionId: '9954bb05-647c-44c8-9a33-d8cd7576a4c1', baseRevision: 1,
  baseSha256: '369f0414f45506eba6d4908361f07c9ecd6c0778888ac167846ca9207f89c0f6',
  sha256: 'fcb496ed002ff468706e891d1b6c37ff2178d845fa23e9d6ed79056cc113aa73', bytes: 448047
};
function requireThat(ok, code) { if (!ok) throw new Error(code); }
function exactSave(value) { return value?.sha256 === expected.sha256 && value?.bytes === expected.bytes; }
async function main() {
  const profile = JSON.parse(await readFile(new URL('../../config/hosts/pc-a.local.json', import.meta.url), 'utf8'));
  requireThat(profile.worldId === 'worldsynctest', 'WORLD_MISMATCH');
  const backupPath = process.argv[2];
  requireThat(backupPath && path.isAbsolute(backupPath), 'PRESERVED_BACKUP_REQUIRED');
  const info = await lstat(backupPath);
  requireThat(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'BACKUP_LINK_REJECTED');
  const bytes = await readFile(backupPath);
  requireThat(exactSave({sha256:digest(bytes), bytes:bytes.length}), 'CONFIRMED_BACKUP_MISMATCH');
  const files = await FixtureFiles.create('pc-a');
  const cloud = new CloudClient({...profile, baseUrl:profile.cloudUrl, token:process.env.WORLDSYNC_API_TOKEN, saveFileName:'WorldSyncTest.sav'});
  const server = new SandboxServer(files, profile);
  const supervisor = new Supervisor({files, server, cloud});
  const journal = await files.previous();
  requireThat(journal?.phase === 'recovery_required' && journal.failure === 'WS_SERVER_ACTIVE', 'RECOVERY_JOURNAL_MISMATCH');
  requireThat(journal.session?.sessionId === expected.sessionId && journal.session.baseRevision === 1 && journal.session.baseSha256 === expected.baseSha256, 'LOCAL_SESSION_MISMATCH');
  requireThat(exactSave(journal.lastConfirmedSave) && journal.lastConfirmedSave.success && journal.lastConfirmedSave.exclusive, 'CONFIRMED_SAVE_REQUIRED');
  await server.assertStopped();
  const observed = await server.inspect();
  requireThat(!observed.active && exactSave(observed.confirmed) && [0,-1073741510].includes(observed.exit?.exitCode), 'STOPPED_SAVE_MISMATCH');
  // Refuse any existing supervisor lock; never delete or steal another owner.
  await files.lock();
  requireThat(JSON.stringify(await files.previous()) === JSON.stringify(journal), 'JOURNAL_CHANGED');
  await files.snapshot(); // Also enforce the host dedicated-process and writer-marker guards.
  const id = randomUUID();
  const evidence = path.join(files.root, `recovery-${id}.before.json`);
  const fd = await open(evidence, 'wx');
  try { await fd.writeFile(JSON.stringify(journal,null,2)); await fd.sync(); } finally { await fd.close(); }
  const status = await cloud.status();
  requireThat(status.worldId === 'worldsynctest' && status.currentRevision === 1 && status.latest?.sha256 === expected.baseSha256 && status.session?.sessionId === expected.sessionId && status.session.baseRevision === 1 && status.session.baseSha256 === expected.baseSha256 && status.session.status === 'hosting', 'CLOUD_SESSION_MISMATCH');
  const beat = await cloud.heartbeat(expected.sessionId);
  requireThat(beat.heartbeat && beat.sessionId === expected.sessionId, 'HEARTBEAT_INVALID');
  supervisor.state = journal;
  const revived = await supervisor.owned();
  requireThat(revived.availability === 'busy', 'SESSION_NOT_REVIVED');
  await server.assertStopped();
  const stage = await files.stage(bytes);
  const installed = await files.install(stage, expected);
  requireThat(installed.installed && exactSave(installed), 'RECOVERY_INSTALL_MISMATCH');
  supervisor.state = {...journal, phase:'stopped', recoveryEvidence:evidence, recoveryImport:installed, lastHeartbeatUtc:beat.lastHeartbeatUtc};
  delete supervisor.state.failure;
  await supervisor.record();
  // Reuse the existing commit and lost-response reconciliation, without retries.
  await supervisor.publish();
  const final = await cloud.status();
  requireThat(final.currentRevision === 2 && exactSave(final.latest) && final.latest.committedBy?.sessionId === expected.sessionId && final.session === null && final.availability === 'free', 'FINAL_COMMIT_UNCONFIRMED');
  await atomicJson(path.join(files.root, `recovery-${id}.completed.json`), {before:evidence, final});
  // Only confirmed revision 2 permits closing leases; preserve every artifact.
  await server.assertStopped();
  await rename(path.join(profile.labPath, 'adapter.lock'), path.join(profile.labPath, `adapter-${id}.closed`));
  await files.unlock();
  console.log(JSON.stringify({revision:final.currentRevision,sha256:final.latest.sha256,bytes:final.latest.bytes,session:final.session,availability:final.availability}));
}
main().catch(error => { console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'RECOVERY_FAILED_EVIDENCE_RETAINED'); process.exitCode=1; });

