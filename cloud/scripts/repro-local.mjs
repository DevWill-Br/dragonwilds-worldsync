import { Miniflare, Log, LogLevel } from 'miniflare';
import path from 'node:path';
const persist = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (persist) {
  const db = path.join(persist, 'dragonwilds-worldsync-api-WorldCoordinator', `${'f'.repeat(64)}.sqlite`);
  console.log(`SQLite database path length: ${db.length}; journal path length: ${db.length + '-journal'.length}`);
}
const mf = new Miniflare({
  host: '127.0.0.1', port: 0,
  name: 'dragonwilds-worldsync-api',
  log: new Log(LogLevel.DEBUG),
  compatibilityDate: '2026-07-14',
  ...(persist ? { durableObjectsPersist: persist } : {}),
  modules: true,
  script: `import { DurableObject } from 'cloudflare:workers';
    export class WorldCoordinator extends DurableObject { async ping() { return {pong:true}; } }
    export default { async fetch(request,env) {
      if(new URL(request.url).pathname === '/health') return Response.json({ok:true});
      return Response.json(await env.PROBE.get(env.PROBE.idFromName('probe')).ping());
    } };`,
  durableObjects: { PROBE: 'WorldCoordinator' }
});
try {
  const url = await mf.ready;
  for (const path of ['/health', '/ping']) {
    const response = await fetch(new URL(path,url));
    console.log(path,response.status,await response.text());
    if (response.status !== 200) process.exitCode = 1;
  }
} finally { await mf.dispose(); }
