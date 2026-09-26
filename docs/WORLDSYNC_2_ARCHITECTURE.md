# Dragonwilds WorldSync 2.0 — Architecture

## Goal

Evolve WorldSync from a local-world handoff utility into a distributed manager for the official RuneScape: Dragonwilds Dedicated Server.

The core user flow remains simple:

1. A player clicks **Assume Server**.
2. WorldSync verifies that no other active host owns the world.
3. It acquires the world lock.
4. It restores the latest shared world into the local Dedicated Server save directory.
5. It validates the world state and starts the Dedicated Server.
6. While hosting, WorldSync maintains host/session state.
7. The player clicks **Stop and Hand Off**.
8. WorldSync stops the Dedicated Server cleanly, backs up and validates the world, publishes the latest state, and releases the lock.

## What is reused from v1.4.2

- PT-BR / English UI foundation.
- first-run setup wizard.
- shared folder model.
- `current/`, `backups/`, `lock/`, `logs/`.
- `world.meta.json` and `latest.json`.
- local configuration storage.
- host identity and admin mode.
- backup-before-import and backup-on-release concepts.
- activity log.
- force unlock as an emergency/admin action.

## What changes

### Save target

v1 copies the shared `.sav` into the player's local game save directory.

v2 will copy the shared `.sav` into the Dedicated Server's:

`RSDragonwilds/Saved/Savegames`

The Dedicated Server must be stopped before WorldSync changes this directory.

### Process control

WorldSync 2.0 will manage the Dedicated Server process directly:

- detect installation/executable;
- optionally install/update through SteamCMD;
- start server;
- detect readiness;
- stop server cleanly;
- detect abnormal exits.

### Stronger session ownership

The old static `world.lock.json` will evolve into a session record with:

- `sessionId`;
- `host`;
- `machine`;
- `startedAtUtc`;
- `lastHeartbeatUtc`;
- `worldRevision`;
- `sourceHash`;
- `status`.

A heartbeat prevents an abandoned static lock from looking healthy forever.

### Integrity

WorldSync 2.0 will add SHA-256 validation for world files.

Before a handoff is accepted:

- source file hash is calculated;
- copied file hash is verified;
- published world hash is written to `latest.json`;
- the next host validates the downloaded/imported file against that hash.

### Revisioning

Each successful handoff increments a monotonic `worldRevision`.

This prevents a machine with an older synced copy from silently replacing a newer world.

## Proposed shared structure

```text
<SharedRoot>/
├── current/
│   ├── <world>.sav
│   └── latest.json
├── backups/
├── lock/
│   └── world.lock.json
├── logs/
│   └── activity.log
└── world.meta.json
```

## Proposed local configuration

New fields for v2:

- `DedicatedServerInstallPath`
- `DedicatedServerExePath`
- `DedicatedServerSaveFolder`
- `SteamCmdPath`
- `ServerPort`
- `BeaconPort`
- `AutoUpdateDedicatedServer`
- `HeartbeatSeconds`
- `StaleLockSeconds`

Secrets such as admin/world passwords should not be written into shared metadata.

## Phase 1 — Safe handoff core

- Keep the existing UI and configuration system.
- Add SHA-256 helpers.
- Add `worldRevision`.
- Add `sessionId` and heartbeat.
- Make lock acquisition safer.
- Add stale-lock recovery checks.
- Make publishing atomic: stage -> verify -> replace.
- Never release the lock until the new shared state is fully written and verified.

## Phase 2 — Dedicated Server integration

- detect server installation;
- detect server process;
- configure server save directory;
- import shared world to server;
- start server;
- stop server;
- publish server world after shutdown.

## Phase 3 — Setup and update automation

- Dedicated Server installation helper;
- SteamCMD update path;
- server/client version diagnostics;
- firewall/UDP diagnostics;
- server configuration editor.

## Phase 4 — UX and resilience

- server state dashboard;
- host heartbeat indicator;
- clearer recovery workflow;
- restore-from-backup workflow;
- structured logs;
- packaging/release hardening.

## Safety invariants

WorldSync 2.0 must never:

1. overwrite the shared world while the Dedicated Server is running;
2. allow two healthy sessions to own the same world;
3. publish a file whose hash does not match the verified local source;
4. replace a higher `worldRevision` with a lower one automatically;
5. force-unlock a healthy session without explicit admin action;
6. release a lock before publication and verification finish.

## Initial implementation target

The first milestone is successful handoff between two Windows PCs:

```text
PC A -> Assume Server -> Dedicated Server starts
PC A -> Stop and Hand Off -> world published
PC B -> Assume Server -> same world restored -> Dedicated Server starts
```

No UI redesign is required for this milestone. Correctness and save safety come first.
