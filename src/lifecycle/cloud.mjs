import { createHash } from 'node:crypto';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export class CloudClient {
  constructor({ baseUrl, token, worldId, timeoutMs = 10000 }) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('LOCALHOST_ONLY');
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(worldId) || typeof token !== 'string' || token.length < 24) throw new Error('INVALID_CLOUD_CONFIG');
    this.base = `${url.origin}/v1/worlds/${worldId}`;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }
  async request(action, { body, binary, headers = {} } = {}) {
    let response;
    try {
      response = await fetch(`${this.base}/${action}`, {
        method: body === undefined && binary === undefined ? 'GET' : 'POST',
        redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': binary ? 'application/octet-stream' : 'application/json', ...headers },
        ...(binary !== undefined ? { body: binary } : body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch { throw new Error('CLOUD_UNAVAILABLE'); }
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw new Error(/^[A-Z_]+$/.test(value.error) ? value.error : `CLOUD_HTTP_${response.status}`);
    }
    return response;
  }
  async status() { return (await this.request('status')).json(); }
  async acquire() { return (await this.request('acquire', { body: { host: 'lifecycle-fixture', machineId: 'isolated-fixture' } })).json(); }
  async heartbeat(sessionId) { return (await this.request('heartbeat', { body: { sessionId } })).json(); }
  async download(latest) {
    const response = await this.request('latest');
    if (Number(response.headers.get('x-worldsync-revision')) !== latest.worldRevision || response.headers.get('x-worldsync-sha256') !== latest.sha256 || Number(response.headers.get('x-worldsync-bytes')) !== latest.bytes) throw new Error('DOWNLOAD_METADATA_MISMATCH');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > latest.bytes || size > 32 * 1024 * 1024) throw new Error('DOWNLOAD_SIZE_MISMATCH');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== latest.bytes || digest(bytes) !== latest.sha256) throw new Error('DOWNLOAD_INTEGRITY_FAILED');
    return bytes;
  }
  async commit(session, bytes) {
    return (await this.request('commit', { binary: bytes, headers: {
      'x-session-id': session.sessionId, 'x-base-revision': String(session.baseRevision),
      'x-save-sha256': digest(bytes), 'x-save-file-name': 'synthetic.sav'
    } })).json();
  }
}
