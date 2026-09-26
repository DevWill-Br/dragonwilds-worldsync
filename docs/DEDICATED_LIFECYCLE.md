# Dedicated lifecycle: synthetic milestone

This milestone connects the existing cloud protocol to a local supervised writer.
It is deliberately **synthetic-only**: the real installation is detected read-only;
the process started in tests is `tests/fixtures/dedicated-server.mjs`, not the
Dragonwilds executable. No real save or server configuration is opened by the
lifecycle commands. Native server startup/shutdown must be qualified separately
against an isolated installation before the fixture restriction is relaxed.

## Decisions

- A foreground Node supervisor owns the child process, session and heartbeat.
  It serializes lifecycle commands and heartbeat updates, avoiding separate
  invocations that lose child ownership or a background heartbeat after shell exit.
- The existing Durable Object remains the authority. The Worker and its protocol
  are unchanged. The commit atomically publishes metadata and clears its session;
  the supervisor confirms revision, hash, size and committing session before
  clearing local ownership. There is no separate premature unlock call.
- File operations use Windows PowerShell/.NET read handles denying writers,
  flushed staging files, verified backups and atomic `File.Replace`/rename.
- Paths are restricted to `tests/.scratch/lifecycle/<fixture-name>`. Save names
  are fixed as `synthetic.sav`. Junctions/symlinks and hardlinked files are rejected
  by the Node path guard. The PowerShell boundary independently checks confinement
  and reparse points. Secrets stay in process environment, never in the journal.
- A local exclusive-create supervisor lock prevents competing local controllers.
  It is archived on clean controller close, never automatically stolen after a
  crash. A durable `server.running` marker is created before spawning a writer and
  archived only after successful process termination. Both the supervisor and
  file-operation helper reject access while that marker exists; a crash fails closed.
- Process detection conservatively rejects operations if any Dragonwilds process
  exists. Errors in process enumeration are failures, not evidence that it stopped.

## Detection (read-only)

From the repository root:

```powershell
node src/lifecycle/cli.mjs detect
```

Detection checks the standard Steam installation's launcher, shipping executable,
and known WindowsServer/Windows `DedicatedServer.ini` locations. It reports paths
and process IDs/names only; it never reads INI contents or enumerates saves.
`DetectServer.ps1 -InstallPath <directory>` supports another explicit installation.
The actual launcher, shipping executable and WindowsServer INI were located on
this PC. No real Dragonwilds process was running during validation.

## CLI

Start the local Worker with `npm run dev` from `cloud/`. Supply the development
token in `WORLDSYNC_API_TOKEN` without putting it in a command argument or Git.
For a synthetic world that already has a canonical revision:

```powershell
node src/lifecycle/cli.mjs my-fixture synthetic-world http://127.0.0.1:8787
```

The supervisor stays in the foreground and accepts one command per line:

| Command | Behavior |
| --- | --- |
| `status` | Report local phase/process state and cloud authority |
| `assume` | Acquire session, verify canonical base, download/stage/verify, back up and atomically install |
| `start-server` | Recheck authority and installed hash; start the synthetic process; require readiness and survival |
| `stop-server` | Request save-and-exit, await actual exit, reject timeout/nonzero exit |
| `publish` | Require clean stop; lock/copy/verify staging, commit and independently confirm cloud state |
| `exit` | Gracefully stop managed writer if necessary; retain uncommitted cloud ownership for recovery |

`assume` starts heartbeats after verified import so preparation cannot silently
leave a held session unmaintained. They continue through hosting and stopped state
until confirmed publication. Commands are serialized with heartbeat operations.
The interval defaults to 15 seconds; synthetic tests can set
`WORLDSYNC_HEARTBEAT_MS` (400–30000). Keep it below the cloud stale interval.
EOF follows `exit` cleanup. Abrupt termination leaves the journal/marker/lock for
explicit recovery; it does not grant permission to another local controller.

The CLI only accepts HTTP loopback cloud endpoints and never follows redirects.
It cannot operate a remote production endpoint. It cannot bootstrap a real world.
No canonical revision means failure with ownership retained, not an implicit import
of an arbitrary local save. The integration suite seeds canonical synthetic bytes
through the real cloud acquire/commit protocol before starting its lifecycle.

## Failures and recovery

Start failure, shutdown timeout, empty/missing save, corrupt transfer/staging,
base revision change or lost session block publication. Heartbeat/authority loss
requests graceful stop; if that fails, the process marker still blocks file
operations. The supervisor never force-kills a writer and never steals a session.

If the commit response is lost, the supervisor queries cloud state and checks the
expected next revision, snapshot SHA-256/size and original session ID. A match
confirms completion without uploading again. If confirmation fails, the local
journal and staging remain in `recovery_required`; the server may already have
committed, so no blind retry or automatic unlock is permitted.

Staging and backups are retained. No automated crash recovery, rollback or pruning
is implemented. An unfinished local journal prevents a fresh `assume`. External
programs manually changing fixture files/starting writers outside this supervisor
are outside its control; Windows sharing locks and conservative process checks add
protection, but this is not an OS-wide launch interlock or a security boundary
against a malicious same-user process.

## Validation

```powershell
cd cloud
npm ci
npm run check
npm run test:local
npm run test:lifecycle
```

The harness runs **`npm run dev`**, passing an isolated generated config and a short
persistence path. It does not call `npx wrangler dev`. The production `.dev.vars`
is never loaded by the harness. Tokens are generated at runtime, redacted from
captured logs and not committed. Only synthetic bytes reach local R2.

The lifecycle suite covers the happy path and failures using real child processes,
real Windows file locking and the actual local Durable Object/R2 implementation.
Faults that cannot naturally be forced deterministically (corrupt transfer, lost
response, revision/authority changes, network failure) use injected client/file
boundaries; the subsequent fail-closed behavior and unchanged cloud revision are
checked. A missing/empty save is produced by the fixture during graceful shutdown.

Additional checks cover direct file-operation rejection while running, verified
backup contents, revalidation before start, concurrent local controllers, OS write
handles and junction rejection. Tests retain fixtures under ignored `tests/.scratch`
and sanitized Wrangler logs under ignored `cloud/.wrangler/local-validation`.
The CLI itself is exercised as a separate process through the full command sequence.

## Remaining qualification

- Native Dragonwilds graceful stop/readiness and an isolated save-directory option
  have not been implemented or validated. The synthetic READY message is not proof
  of real server/network readiness. No real executable was launched.
- Production cloud deployment, account authorization and UI remain out of scope.
- npm audit reports four high findings in the pinned development dependency tree
  (Wrangler, Miniflare, sharp and undici). No forced upgrade was applied. Keep the
  runtime loopback-only and validate a dependency upgrade in a separate change.
- Current validated runtime remains Node 24.19.0 / Wrangler 4.112.0 /
  Miniflare 4.20260714.0 / workerd 1.20260714.1.

Next: obtain approval to create a backup and a **copy** of `WorldSyncTest.sav`,
preserving the original. First qualify the real executable in a separate instance
whose configuration and save location cannot fall back to the original directory.
Implement and test its graceful shutdown/readiness adapter, then repeat integrity,
backup-before-import and commit-confirmation tests with the authorized copy.
