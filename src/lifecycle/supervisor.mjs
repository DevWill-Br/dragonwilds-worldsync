import { digest } from './cloud.mjs';

export class Supervisor {
  constructor({ files, server, cloud, heartbeatMs = 15000 }) {
    this.files = files; this.server = server; this.cloud = cloud; this.heartbeatMs = heartbeatMs;
    this.state = { phase: 'idle', session: null }; this.tail = Promise.resolve();
  }
  async open() {
    await this.files.lock();
    const previous = await this.files.previous();
    if (previous && !['idle', 'completed'].includes(previous.phase)) throw new Error('LOCAL_RECOVERY_REQUIRED');
    await this.record();
    return this;
  }
  async record() { await this.files.record({ ...this.state, updatedAtUtc: new Date().toISOString() }); }
  exclusive(action) {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }
  async status() { return { ...this.state, serverActive: this.server.active(), cloud: await this.cloud.status() }; }
  async owned() {
    if (!this.state.session) throw new Error('NO_LOCAL_SESSION');
    const status = await this.cloud.status();
    const session = this.state.session;
    if (status.session?.sessionId !== session.sessionId) throw new Error('SESSION_LOST');
    if (status.availability === 'recovery_required' || status.session.status !== 'hosting') throw new Error('RECOVERY_REQUIRED');
    if (status.currentRevision !== session.baseRevision || (status.latest?.sha256 ?? null) !== session.baseSha256) throw new Error('BASE_REVISION_CHANGED');
    return status;
  }
  async recover(error) {
    clearInterval(this.timer);
    this.state.phase = 'recovery_required'; this.state.failure = error.message;
    // Loss of authority stops the managed writer, but never publishes or unlocks.
    if (this.server.active()) {
      try { await this.server.stop(); } catch { this.state.stopFailed = true; }
    }
    await this.record();
  }
  beginHeartbeats() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.exclusive(async () => {
        if (!this.state.session || this.state.phase === 'recovery_required') return;
        try {
          await this.owned();
          const beat = await this.cloud.heartbeat(this.state.session.sessionId);
          if (beat.sessionId !== this.state.session.sessionId || !beat.heartbeat) throw new Error('HEARTBEAT_INVALID');
          this.state.lastHeartbeatUtc = beat.lastHeartbeatUtc;
          if (this.state.phase === 'running' && !this.server.active()) throw new Error('SERVER_UNEXPECTED_EXIT');
          await this.record();
        } catch (error) { await this.recover(error); }
      });
    }, this.heartbeatMs);
  }
  assume() { return this.exclusive(async () => {
    if (!['idle', 'completed'].includes(this.state.phase)) throw new Error('LOCAL_SESSION_EXISTS');
    await this.server.assertStopped();
    this.state = { phase: 'acquiring', session: null }; await this.record();
    try {
      const session = await this.cloud.acquire();
      if (!session.acquired || !session.sessionId || !Number.isSafeInteger(session.baseRevision)) throw new Error('ACQUIRE_INVALID');
      this.state.session = session; this.state.phase = 'acquired'; await this.record();
      const status = await this.owned();
      const latest = status.latest;
      if (!latest || latest.worldRevision !== session.baseRevision || latest.sha256 !== session.baseSha256) throw new Error('NO_VERIFIED_CANONICAL_REVISION');
      const bytes = await this.cloud.download(latest);
      if (bytes.length !== latest.bytes || digest(bytes) !== latest.sha256) throw new Error('DOWNLOAD_INTEGRITY_FAILED');
      const staged = await this.files.stage(bytes);
      await this.owned(); await this.server.assertStopped();
      this.state.phase = 'importing'; await this.record();
      const installed = await this.files.install(staged, latest);
      if (installed.sha256 !== latest.sha256 || installed.bytes !== latest.bytes) throw new Error('IMPORT_INTEGRITY_FAILED');
      this.state.phase = 'prepared'; this.state.import = installed; await this.record();
      this.beginHeartbeats();
      return { phase: this.state.phase, revision: session.baseRevision };
    } catch (error) { await this.recover(error); throw error; }
  }); }
  startServer() { return this.exclusive(async () => {
    if (this.state.phase !== 'prepared') throw new Error('NOT_PREPARED');
    try {
      await this.owned(); await this.server.assertStopped();
      // Verify the installed file again immediately before starting a writer.
      const copy = await this.files.snapshot();
      if (copy.sha256 !== this.state.session.baseSha256) throw new Error('PRESTART_HASH_MISMATCH');
      this.state.phase = 'starting'; await this.record();
      const process = await this.server.start();
      this.state.phase = 'running'; this.state.pid = process.pid; await this.record();
      return { phase: 'running', pid: process.pid };
    } catch (error) { await this.recover(error); throw error; }
  }); }
  stopServer() { return this.exclusive(async () => {
    if (!['running', 'recovery_required'].includes(this.state.phase)) throw new Error('NOT_RUNNING');
    const recovery = this.state.phase === 'recovery_required';
    try {
      this.state.phase = 'stopping'; await this.record();
      await this.server.stop(); await this.server.assertStopped();
      this.state.phase = recovery ? 'recovery_required' : 'stopped'; await this.record();
      return { phase: this.state.phase };
    } catch (error) { await this.recover(error); throw error; }
  }); }
  async verifyCommit(snapshot) {
    const current = await this.cloud.status();
    const session = this.state.session;
    if (current.currentRevision !== session.baseRevision + 1 || current.latest?.sha256 !== snapshot.sha256 || current.latest?.bytes !== snapshot.bytes || current.latest?.committedBy?.sessionId !== session.sessionId || current.session?.sessionId === session.sessionId) throw new Error('COMMIT_UNCONFIRMED');
    return current;
  }
  publish() { return this.exclusive(async () => {
    await this.server.assertStopped();
    if (this.state.phase !== 'stopped') throw new Error('CLEAN_STOP_REQUIRED');
    try {
      await this.owned();
      const snapshot = await this.files.snapshot();
      const bytes = await this.files.readStage(snapshot.path);
      if (!bytes.length || bytes.length !== snapshot.bytes || digest(bytes) !== snapshot.sha256) throw new Error('STAGING_INTEGRITY_FAILED');
      this.state.phase = 'publishing'; this.state.snapshot = snapshot; await this.record();
      await this.owned(); await this.server.assertStopped();
      // A lost HTTP response is reconciled by the committed session/revision/hash,
      // never by blindly retrying a potentially completed upload.
      try { await this.cloud.commit(this.state.session, bytes); }
      catch (error) { this.state.commitResponseError = error.message; }
      const committed = await this.verifyCommit(snapshot);
      clearInterval(this.timer);
      this.state.completedSessionId = this.state.session.sessionId;
      this.state.session = null; this.state.phase = 'completed';
      this.state.publishedRevision = committed.currentRevision;
      await this.record();
      return { phase: 'completed', revision: committed.currentRevision };
    } catch (error) { await this.recover(error); throw error; }
  }); }
  async close() {
    clearInterval(this.timer); await this.tail;
    if (this.server.active()) {
      await this.recover(new Error('SUPERVISOR_CLOSING'));
      if (this.server.active()) throw new Error('SERVER_STILL_ACTIVE');
    }
    if (this.state.session && this.state.phase !== 'recovery_required') await this.recover(new Error('SESSION_RETAINED_ON_CLOSE'));
    await this.files.unlock();
  }
}
