import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CloudClient, cloudOrigin } from '../../src/lifecycle/cloud.mjs';
test('allow loopback development and HTTPS production; reject insecure or ambiguous URLs', () => {
  for (const url of ['http://127.0.0.1:8787', 'http://localhost', 'http://[::1]', 'https://worldsync.example.com']) assert.ok(cloudOrigin(url));
  for (const url of ['http://example.com', 'http://localhost.evil.com', 'ftp://example.com']) assert.throws(() => cloudOrigin(url), /HTTPS_REQUIRED/);
  for (const url of ['https://user:secret@example.com', 'https://example.com/path', 'https://example.com?q=x', 'https://example.com#x', 'https://bad_host.com', 'https://example.com\\path', ' https://example.com']) assert.throws(() => cloudOrigin(url), /INVALID_CLOUD_URL/);
});
test('redirect is rejected without contacting the destination or forwarding bearer', async () => {
  let destinationHits = 0;
  const server = createServer((req, res) => {
    if (req.url === '/destination') { destinationHits++; res.end('{}'); }
    else { res.writeHead(302, { location: '/destination' }); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const client = new CloudClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, worldId: 'test', token: 'synthetic-test-token-123456789' });
    assert.ok(!JSON.stringify(client).includes(client.token));
    await assert.rejects(client.status(), /CLOUD_UNAVAILABLE/);
    assert.equal(destinationHits, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
