# WorldSync 2.0 Cloud Authority

Status: prototype control plane. It does not migrate or upload the real Dragonwilds save automatically.

## Why the architecture changed

OneDrive/Dropbox-style folder replication can transport bytes, but it cannot safely
decide which PC owns a world at a given moment. WorldSync 2.0 therefore separates
coordination from save storage:

- a Cloudflare Worker exposes the authenticated API;
- one Durable Object per world is the authoritative coordinator;
- R2 stores immutable save revisions;
- the Windows client remains responsible for Dedicated Server lifecycle and local
  SHA-256 verification.

A stale heartbeat never grants ownership to another machine. It changes availability
to `recovery_required` and waits for explicit recovery logic.

## Cloud layout

```text
PC A / PC B
    |
    | HTTPS + bearer token
    v
Cloudflare Worker
    |
    +---- Durable Object(world id)
    |       currentRevision
    |       latest metadata
    |       active session
    |       heartbeat
    |
    +---- R2
            worlds/<world>/revisions/
              00000001-<hash-prefix>.sav
              00000002-<hash-prefix>.sav
              ...
```

Revisions are never intentionally overwritten. The Durable Object pointer is updated
only after R2 upload and metadata verification complete.

## API v1

All `/v1/*` endpoints require:

```http
Authorization: Bearer <WORLDSYNC_API_TOKEN>
```

The token is a Cloudflare Worker secret and must never be committed to Git.

### Status

`GET /v1/worlds/:worldId/status`

Returns the canonical revision, current session and one of:

- `free`
- `busy`
- `committing`
- `recovery_required`

### Acquire

`POST /v1/worlds/:worldId/acquire`

```json
{
  "host": "William",
  "machineId": "PC-WILLIAM"
}
```

A healthy existing session returns HTTP 409. A stale session also returns 409 with
`RECOVERY_REQUIRED`; it is not stolen.

### Heartbeat

`POST /v1/worlds/:worldId/heartbeat`

```json
{
  "sessionId": "<uuid>"
}
```

### Download canonical revision

`GET /v1/worlds/:worldId/latest`

Returns the raw `.sav` with expected revision/hash metadata in response headers.

### Commit new revision

`POST /v1/worlds/:worldId/commit`

Headers:

```text
x-session-id: <uuid>
x-base-revision: <integer>
x-save-sha256: <lowercase sha256>
x-save-file-name: WorldSyncTest.sav
content-type: application/octet-stream
```

The request body is the save bytes. The coordinator verifies session ownership,
base revision, SHA-256 and size. It writes an immutable R2 object, verifies R2
metadata, then advances the canonical revision and releases the session.

An R2 object uploaded before a failed coordinator commit can remain orphaned. It is
not canonical and is intentionally not deleted automatically.

## Local development

No production save is needed.

```powershell
cd cloud
npm install
npm run check
npx wrangler dev
```

Wrangler local development uses local simulated bindings unless remote mode is
explicitly requested. Use synthetic save fixtures for the first end-to-end tests.

The Worker refuses authenticated API calls until a bearer secret exists. For local
development create a git-ignored `.dev.vars` file:

```text
WORLDSYNC_API_TOKEN=<a long random development-only value>
```

Do not reuse that token in production.

## Production provisioning (later milestone)

Before deployment:

```powershell
cd cloud
npx wrangler login
npx wrangler r2 bucket create dragonwilds-worldsync-saves
npx wrangler secret put WORLDSYNC_API_TOKEN
npm run deploy
```

The configuration uses a SQLite-backed Durable Object through the declarative
`exports` configuration. No Cloudflare credentials, account IDs, save files,
OwnerId, world/admin passwords or local server configuration belong in Git.

## Safety boundaries still open

This cloud layer does not yet:

- start or stop the Dragonwilds Dedicated Server;
- import the canonical save into the server directory;
- run the Windows heartbeat loop;
- offer explicit stale-session recovery;
- authenticate individual friends separately;
- migrate `WorldSyncTest.sav` into revision 1.

Those remain separate milestones. The real save must not be uploaded until local
backup, client-side hash verification and explicit migration approval are complete.
