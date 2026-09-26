import { createInterface } from 'node:readline';
import { CloudClient } from './cloud.mjs';
import { FixtureFiles } from './files.mjs';
import { FixtureServer, detectServer } from './process.mjs';
import { Supervisor } from './supervisor.mjs';

if (process.argv[2] === 'detect') {
  console.log(JSON.stringify(await detectServer(), null, 2));
} else {
  const [name, worldId, baseUrl = 'http://127.0.0.1:8787'] = process.argv.slice(2);
  if (!name || !worldId) throw new Error('Usage: node src/lifecycle/cli.mjs <fixture-name> <synthetic-world-id> [localhost-url], or detect');
  const heartbeatMs = Number(process.env.WORLDSYNC_HEARTBEAT_MS || 15000);
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 400 || heartbeatMs > 30000) throw new Error('INVALID_HEARTBEAT_INTERVAL');
  const files = await FixtureFiles.create(name);
  const server = new FixtureServer(files);
  const cloud = new CloudClient({ baseUrl, worldId, token: process.env.WORLDSYNC_API_TOKEN });
  const supervisor = await new Supervisor({ files, server, cloud, heartbeatMs }).open();
  const commands = {
    status: () => supervisor.status(), assume: () => supervisor.assume(),
    'start-server': () => supervisor.startServer(), 'stop-server': () => supervisor.stopServer(),
    publish: () => supervisor.publish()
  };
  const input = createInterface({ input: process.stdin });
  console.log('Synthetic-only supervisor. Commands: status, assume, start-server, stop-server, publish, exit');
  try {
    for await (const line of input) {
      if (line.trim() === 'exit') break;
      try {
        const action = commands[line.trim()];
        if (!action) throw new Error('UNKNOWN_COMMAND');
        console.log(JSON.stringify(await action()));
      } catch (error) { console.log(JSON.stringify({ error: error.message })); }
    }
  } finally { input.close(); await supervisor.close(); }
}
