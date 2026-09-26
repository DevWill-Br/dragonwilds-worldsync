# WorldSync cloud: local development

```powershell
npm ci
npm run check
npm run test:local
npm run dev
# Optional: npm run dev -- --port 8790
```

`npm run dev` forces local bindings, listens on `127.0.0.1`, disables Wrangler
metrics and selects a stable short persistence directory. It does not deploy,
open a tunnel, or request OAuth login. Configure the development authentication
secret through the ignored `.dev.vars` as before; never commit or print it.

Windows state now lives in `%LOCALAPPDATA%\WorldSync\<checkout-hash>`.
The checkout hash isolates different clones. Other platforms use
`$XDG_STATE_HOME/WorldSync/<checkout-hash>` (or `~/.local/state`).
Use the absolute `WORLDSYNC_LOCAL_STATE_DIR` environment variable to override it.
The launcher rejects Windows paths whose estimated SQLite journal path exceeds
240 characters, leaving headroom for SQLite's sidecar files. Moving a checkout
changes the default hash; keep an explicit state path if continuity is required.

The previous `.wrangler/state` is **not deleted, migrated or reused**. The default
short directory starts empty on first use. This is a local development change,
not a migration of cloud state or the Dragonwilds world. Direct `wrangler dev`
bypasses this protection; use `npm run dev` or supply a short `--persist-to` path.

## Root cause: Windows SQLite path length

The minimal repro succeeds without project logic and fails solely when its
persisted database path is long. In the affected checkout, workerd tried to create:

```text
<checkout>/cloud/.wrangler/state/v3/do/
dragonwilds-worldsync-api-WorldCoordinator/<64-character-id>.sqlite
```

The database path is 254 characters; its `-journal` name is 262. The runtime logs
`SENTRY_DO SQLite failed ... unable to open database file: SQLITE_CANTOPEN` and
returns `internal error; reference = ...`. `/health` works because it never
instantiates the Durable Object. Keeping the namespace/class, runtime and code
identical but using a short persistence directory makes `ping()` succeed.
This isolates the storage-path failure; Node 24, the exported class and RPC syntax
were not the cause observed here. No runtime downgrade or architecture rewrite
is needed.

Switching the production binding between KV and SQLite cannot bypass this local
implementation: [workerd uses SQLite for all local Durable Objects](https://github.com/cloudflare/workerd/blob/main/src/workerd/server/workerd.capnp).
The SQLite path failure is demonstrated locally; this report does not claim a
specific upstream fix or that every Windows build has an identical length boundary.

Minimal comparison (no authentication, save or session code):

```powershell
npm run repro:local
# Explicit short directory, outside production/server data:
npm run repro:local -- C:\ws-repro
# On the original deep checkout this reproduces SQLITE_CANTOPEN:
npm run repro:local -- .wrangler/state/v3/do
```

The repro prints path lengths, starts a localhost server, calls `/health` and
`/ping`, and exits nonzero for a failed request. It does not remove existing state.
Use unused fixture directories for comparisons.

## Verified versions and tests

- Windows, Node **24.19.0**, npm **11.17.0**.
- Wrangler **4.112.0**, Miniflare **4.20260714.0**, workerd **1.20260714.1**.
- Wrangler/Miniflare are exact dependencies; `package-lock.json` fixes the tree.
- Compatibility date remains `2026-07-14`; `wrangler.jsonc` and application logic
  are unchanged. Wrangler's package requires Node >=22; the observed Node 24
  version works, so a second Node installation was unnecessary.
- `npm ci --offline` completed, followed by **9/9** `npm run check` tests.

`npm run test:local` starts the actual Wrangler CLI/workerd using a copy of the
project config with the real source files, short isolated state, a random test
token and a five-second stale interval. It never reads the project's `.dev.vars`.
It verifies actual HTTP calls over loopback:

1. `/health`: 200.
2. `/v1/worlds/worldsynctest/debug-ping`: 200, `pong=true`.
3. `/v1/worlds/worldsynctest/status`: 200, `worldId=worldsynctest`,
   `currentRevision=0`, `availability=free`.
4. Windows PowerShell `WorldSync2.ps1 -Action CloudAcquire` creates a session;
   a second invocation fails with `WORLD_BUSY`.
5. The one-shot function used by `CloudHeartbeat` advances the timestamp.
6. Four concurrent acquisitions on an independent test world produce one owner
   and three rejections.
7. Stale status is `recovery_required`; acquisition returns HTTP 409 with
   `RECOVERY_REQUIRED`, retaining ownership. A foreign heartbeat fails with 403.
8. After restarting Wrangler, the same session remains persisted and cannot
   be stolen, even though its heartbeat is stale.

Tests stop only the subprocess tree they created. Synthetic fixtures stay in a
short OS temporary directory; sanitized logs are in ignored
`.wrangler/local-validation/wrangler.log`. Integration tests currently require
Windows PowerShell. Unit/path tests run without a Cloudflare account.

## Remaining scope

No deploy, production binding validation, UI change, save upload, world migration,
or Dedicated Server configuration change was performed. Recovery is deliberately
not an automatic takeover. Production authentication and deployment still require
their own review and authorization. The local runtime workaround does not fix
SQLite's handling of long paths upstream.

Next: integrate session acquisition and periodic heartbeat with a supervised
Dedicated Server lifecycle, first using synthetic saves. Stop safely, validate
hashes and publish before releasing ownership; add backup-before-import and
explicit recovery. Obtain confirmation before any real-world migration.
